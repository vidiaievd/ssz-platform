import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { readRubricMarks } from '@ssz/shared-kernel/writing-task';
import { ReviewAttemptCommand } from './review-attempt.command.js';
import type { RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import {
  marksWithCarried,
  readMarks as raReadMarks,
  readSpeakingSnapshot,
  readSubmission as raReadSubmission,
  scoreSubmission,
  TEMPLATE_CODE as READ_ALOUD,
} from '@ssz/shared-kernel/read-aloud';
import type { SpeakingSnapshot } from '@ssz/shared-kernel/read-aloud';
import type { Attempt, ReviewDecision } from '../../../domain/entities/attempt.entity.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import { Inject } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import type { ContentClientError } from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ReviewScoring } from '../../services/review-scoring.js';
import type { AutoOutcome } from '../../services/review-scoring.js';
import { foldSentenceComments, publishAttemptEvents } from '../../services/review-verdict.js';
import {
  ReviewCommentRequiredError,
  type AttemptDomainError,
} from '../../../domain/exceptions/attempt.errors.js';

export type ReviewAttemptError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  /** A colleague got here first — the screen has to name them (§4 of the contract). */
  | { code: 'ALREADY_REVIEWED'; by: string; verdict: 'approved' | 'returned'; at: Date }
  /** Sent back with nothing said about why. */
  | { code: 'RETURN_REQUIRES_COMMENT' }
  /**
   * A rubric-graded submission arrived with criteria left unmarked (plan 50 §4). For a
   * `read_aloud` the entries are `itemId:criterionId` — the mark's own key.
   */
  | { code: 'RUBRIC_INCOMPLETE'; missing: string[] }
  /** A `read_aloud` prompt with no word to the student about it (plan 70 §3.6, README idea 2). */
  | { code: 'READ_ALOUD_COMMENT_REQUIRED'; missing: string[] }
  | ContentClientError
  | AttemptDomainError;

export interface ReviewAttemptResult {
  attemptId: string;
  status: 'SCORED' | 'RETURNED';
  /** 0–100. Null on a return, which ends the attempt unmarked. */
  score: number | null;
  approvedItems: number;
  totalItems: number;
  /**
   * The rubric total behind the verdict, in the unit the threshold is set in — what the
   * queue prints under the button. Null for the templates graded per item.
   */
  rubricScore: { points: number; max: number; passScore: number } | null;
  /**
   * `read_aloud` only: each prompt's points and verdict (plan 70, Q1-A). `rubricScore` then
   * carries the sums over prompts and the threshold of one recording — the attempt passes
   * when every prompt here does, not when the sum clears anything. A prompt carried from an
   * earlier try (phase 11b) is listed with the points it passed on and `carried: true`.
   */
  promptScores?: Array<{
    itemId: string;
    points: number;
    max: number;
    passed: boolean;
    carried?: true;
  }>;
}

/**
 * The teacher's verdict, and the score that follows from it.
 *
 * The score is not sent by the client. It is derived by `ReviewScoring` from what the
 * server can see — so a client cannot award a mark, and two teachers making the same
 * decisions cannot produce two different marks.
 */
@CommandHandler(ReviewAttemptCommand)
export class ReviewAttemptHandler implements ICommandHandler<ReviewAttemptCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    private readonly scoring: ReviewScoring,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    command: ReviewAttemptCommand,
  ): Promise<Result<ReviewAttemptResult, ReviewAttemptError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });

    // Someone has already answered this one. Said before anything else is computed,
    // because the answer the screen needs is who and what, not that it failed.
    const standing = attempt.deliveredVerdict();
    if (standing !== null) {
      return Result.fail({
        code: 'ALREADY_REVIEWED',
        by: standing.reviewerId,
        verdict: standing.outcome,
        at: standing.at,
      });
    }

    const decisions = foldSentenceComments(
      command.decisions,
      command.sentenceComments,
      command.outcome,
    );

    // Graded out of a rubric rather than out of items — the marks decide, and so does
    // the threshold they are measured against, both frozen on the attempt when it was
    // queued (plan 50 §3.2).
    const snapshot = attempt.rubricSnapshot;
    if (snapshot && attempt.templateCode === READ_ALOUD) {
      const speaking = readSpeakingSnapshot(snapshot);
      if (speaking) return this.reviewByPrompt(attempt, command, speaking);
    }
    if (snapshot) {
      return this.reviewByRubric(attempt, command, snapshot);
    }

    if (command.outcome === 'returned') {
      const returned = attempt.review({
        reviewerId: command.reviewerId,
        outcome: 'returned',
        decisions,
        comment: command.comment,
        // Not the attempt's mark — a return keeps none, and the result below still says
        // `score: null`. It is how much of the work the teacher let stand, which is what
        // the evidence event carries to the SRS (plan 63 §4): sent back with two of three
        // sentences approved is not the same failure as sent back with none.
        score: await this.creditedScore(attempt, command.decisions),
      });
      if (returned.isFail) return Result.fail(toError(returned.error));

      await this.attempts.save(attempt);
      await publishAttemptEvents(this.publisher, attempt);
      return Result.ok({
        attemptId: attempt.id,
        status: 'RETURNED',
        score: null,
        approvedItems: 0,
        totalItems: 0,
        rubricScore: null,
      });
    }

    const autoResult = await this.scoring.autoOutcomes(attempt);
    if (autoResult.isFail) return Result.fail(autoResult.error);

    const { approvedItems, totalItems, score } = this.scoring.scoreOf(
      autoResult.value,
      creditedByApproval(autoResult.value, command.decisions),
    );

    const reviewed = attempt.review({
      reviewerId: command.reviewerId,
      outcome: 'approved',
      decisions,
      comment: command.comment,
      score,
      // A submission a teacher has approved item by item passes on those items, not on a
      // threshold this service would have to invent for a template it cannot grade.
      passed: approvedItems > 0,
      approvedItems,
      totalItems,
    });
    if (reviewed.isFail) return Result.fail(toError(reviewed.error));

    await this.attempts.save(attempt);
    await publishAttemptEvents(this.publisher, attempt);

    return Result.ok({
      attemptId: attempt.id,
      status: 'SCORED',
      score,
      approvedItems,
      totalItems,
      rubricScore: null,
    });
  }

  /**
   * How much of a returned submission the teacher let stand, 0-100.
   *
   * Never fails the verdict. A teacher's decision must not wait on the validator being
   * able to re-read the document, so a submission that cannot be parsed is scored from
   * the decisions alone, and one with no decisions at all scores zero — a return of the
   * whole thing, which is what it is.
   */
  private async creditedScore(
    attempt: Attempt,
    decisions: ReviewDecision[],
  ): Promise<number> {
    const auto = await this.scoring.autoOutcomes(attempt);
    if (auto.isOk && auto.value.length > 0) {
      return this.scoring.scoreOf(auto.value, creditedByReturn(auto.value, decisions)).score;
    }

    if (decisions.length === 0) return 0;
    const approved = decisions.filter((decision) => decision.approved).length;
    return Math.round((approved / decisions.length) * 100);
  }

  /**
   * The verdict on a submission a person grades out of criteria.
   *
   * Three things separate it from the item path:
   *
   * - **The verdict is derived, not taken.** `Σ mark × weight >= passScore` is an
   *   approval and anything else is a return. The screen's own label switches on exactly
   *   that number, so obeying a client whose settings had gone stale would deliver a
   *   verdict the marks do not support. The threshold is compared in rubric points, the
   *   unit the author typed it in — never in the percentage the score travels as.
   * - **Every criterion must be marked.** The screen keeps the action disabled until
   *   they are (IMPLEMENTATION.md), and a missing mark silently counting as zero would
   *   turn a UI slip into a failed essay.
   * - **No per-item decisions.** An essay has no items to decide about; the marks are
   *   the feedback, and `ReviewDecision[]` stays empty rather than pretending otherwise
   *   (plan 50 §3.2 point 6).
   */
  private async reviewByRubric(
    attempt: Attempt,
    command: ReviewAttemptCommand,
    snapshot: RubricSnapshot,
  ): Promise<Result<ReviewAttemptResult, ReviewAttemptError>> {
    const marks = readRubricMarks(command.rubricMarks);
    const scored = this.scoring.scoreOf([], [], { snapshot, marks });
    const outcome = scored.rubric;
    if (outcome === null || !outcome.complete) {
      return Result.fail({ code: 'RUBRIC_INCOMPLETE', missing: outcome?.missing ?? [] });
    }

    const rubricScore = { points: outcome.points, max: outcome.max, passScore: snapshot.passScore };

    const reviewed = attempt.review({
      reviewerId: command.reviewerId,
      outcome: outcome.passed ? 'approved' : 'returned',
      decisions: [],
      comment: command.comment,
      score: scored.score,
      // The rubric already answered this, in its own unit. `passed` must not be
      // recomputed from the percentage — 8 of 15 is a pass at a threshold of 8 and 53%
      // everywhere a percentage is read.
      passed: outcome.passed,
      approvedItems: scored.approvedItems,
      totalItems: scored.totalItems,
      rubricMarks: marks,
    });
    if (reviewed.isFail) return Result.fail(toError(reviewed.error));

    await this.attempts.save(attempt);
    await publishAttemptEvents(this.publisher, attempt);

    return Result.ok({
      attemptId: attempt.id,
      status: outcome.passed ? 'SCORED' : 'RETURNED',
      // A return ends the attempt unmarked for every other template, and the letter to
      // the learner says so; the marks are still on the attempt for the queue and for
      // the card the student opens next to their rewrite.
      score: outcome.passed ? scored.score : null,
      approvedItems: scored.approvedItems,
      totalItems: scored.totalItems,
      rubricScore,
    });
  }

  /**
   * The verdict on a `read_aloud`: the rubric once per recording (plan 70 §3.6, Q1-A).
   *
   * What `reviewByRubric` does for an essay, a prompt at a time, plus one rule of its own:
   *
   * - **Marks are keyed `itemId:criterionId`**, the address the handoff gives a criterion
   *   of a prompt, and every criterion of every prompt must carry one.
   * - **Every prompt needs a comment** (README idea 2: «the queue refuses to return a
   *   verdict with no comment») — on an approval as much as on a return. The comment rides
   *   in as the note on the prompt (`sentenceComments`) and is stored as its decision.
   * - **The verdict is derived per prompt.** A prompt passes when its own points reach the
   *   threshold the author set for one recording; the attempt is approved when every prompt
   *   passes and returned otherwise. Its score is the percentage of the points summed over
   *   prompts — for progress and the SRS, never shown as «the mark».
   * - **Each prompt's verdict reaches the memory** (RA-Q6): `gapResults` keyed by prompt,
   *   with the prompt's addresses, on both outcomes — and one step weaker when the student
   *   read a given text aloud (`read`, Q6-A).
   *
   * The prompts are the ones the student handed in, read off the submission: that is what
   * was recorded and what the teacher heard, whatever the exercise holds today.
   *
   * A prompt carried from a returned try (phase 11b) is not the teacher's to grade again: it
   * needs no marks and no comment, whatever the request says about it is ignored, and its
   * frozen ruling is written into the decisions and the marks so the learner's card and the
   * next try read every prompt off this attempt. It counts towards the verdict and the score
   * but not towards the memory — its success was reported on the return, and a second one
   * minutes later would read as a review at no interval.
   */
  private async reviewByPrompt(
    attempt: Attempt,
    command: ReviewAttemptCommand,
    snapshot: SpeakingSnapshot,
  ): Promise<Result<ReviewAttemptResult, ReviewAttemptError>> {
    const recordings = raReadSubmission(attempt.submittedAnswer)?.recordings ?? [];
    const freshIds = recordings.filter((r) => !r.carried).map((r) => r.itemId);
    const requested = raReadMarks(command.rubricMarks);
    const scored = scoreSubmission(snapshot, requested, recordings);
    if (!scored.complete) {
      return Result.fail({ code: 'RUBRIC_INCOMPLETE', missing: scored.missing });
    }

    const comments = foldSentenceComments(command.decisions, command.sentenceComments, 'approved');
    const commentOf = new Map(comments.map((decision) => [decision.itemId, decision.comment]));
    const missing = freshIds.filter((itemId) => (commentOf.get(itemId) ?? '').trim() === '');
    if (missing.length > 0) {
      return Result.fail({ code: 'READ_ALOUD_COMMENT_REQUIRED', missing });
    }

    // One decision per prompt, carrying the teacher's comment and the prompt's own verdict —
    // the learner's card reads both from here (`reviewDecisions`). A carried prompt keeps the
    // comment it was passed with.
    const decisions: ReviewDecision[] = scored.prompts.map((prompt) => ({
      itemId: prompt.itemId,
      approved: prompt.outcome.passed,
      comment: prompt.carried
        ? prompt.carried.comment
        : (commentOf.get(prompt.itemId) ?? '').trim(),
    }));
    const marks = marksWithCarried(requested, recordings);

    const reviewed = attempt.review({
      reviewerId: command.reviewerId,
      outcome: scored.passed ? 'approved' : 'returned',
      decisions,
      comment: command.comment,
      score: scored.percent,
      passed: scored.passed,
      approvedItems: scored.points,
      totalItems: scored.max,
      rubricMarks: marks,
      gapResults: scored.prompts
        .filter((prompt) => !prompt.carried)
        .map((prompt) => ({
          gapKey: prompt.itemId,
          correct: prompt.outcome.passed,
        })),
      evidenceLowered: snapshot.mode === 'read',
    });
    if (reviewed.isFail) return Result.fail(toError(reviewed.error));

    await this.attempts.save(attempt);
    await publishAttemptEvents(this.publisher, attempt);

    return Result.ok({
      attemptId: attempt.id,
      status: scored.passed ? 'SCORED' : 'RETURNED',
      score: scored.passed ? scored.percent : null,
      approvedItems: scored.points,
      totalItems: scored.max,
      rubricScore: { points: scored.points, max: scored.max, passScore: snapshot.passScore },
      promptScores: scored.prompts.map((prompt) => ({
        itemId: prompt.itemId,
        points: prompt.outcome.points,
        max: prompt.outcome.max,
        passed: prompt.outcome.passed,
        ...(prompt.carried ? { carried: true as const } : {}),
      })),
    });
  }
}

/**
 * A domain refusal, named so the edge can answer it properly.
 *
 * Only the empty return is singled out: the screen has a field to put the message beside
 * and a criterion saying it must (18). Everything else is a transition that should not
 * have been attempted, and one code for those is honest.
 */
/**
 * What an approval credits, item by item.
 *
 * The verdict on this screen is over the whole submission — a teacher confirms the work
 * or sends it back, and there is no per-item approve button anywhere in the product
 * (plan 51 §8 Q3). So an approval means every item counts, except any a client that does
 * rule item by item explicitly rejected. Scoring only what the *machine* closed would
 * make the button mean something nobody pressed: a `short_answer` set under
 * `teacherReview: 'all'` routes every question to a person by design, so approving three
 * flawless answers would have scored 0 and reached the SRS as a failure.
 *
 * `command.decisions` rather than the folded ones on purpose. A note left on a sentence
 * is not a ruling against it — the teacher is telling the student what to look at, and
 * they approved the work in the same breath. Folding one into a rejection would quietly
 * mark down the submissions a teacher took the trouble to explain.
 */
function creditedByReturn(auto: AutoOutcome[], explicit: ReviewDecision[]): ReviewDecision[] {
  const ruled = new Map(explicit.map((decision) => [decision.itemId, decision]));

  // The mirror of `creditedByApproval`, and the default is the opposite on purpose. A
  // teacher who approves the work approves what they did not rule against; a teacher who
  // sends it back has not silently passed the sentences they said nothing about — the
  // whole submission is what is coming back.
  return auto.map((item) => ({
    itemId: item.itemId,
    approved: ruled.get(item.itemId)?.approved ?? false,
    comment: ruled.get(item.itemId)?.comment,
  }));
}

function creditedByApproval(auto: AutoOutcome[], explicit: ReviewDecision[]): ReviewDecision[] {
  const ruled = new Map(explicit.map((decision) => [decision.itemId, decision]));

  return auto.map((item) => ({
    itemId: item.itemId,
    approved: ruled.get(item.itemId)?.approved ?? true,
    comment: ruled.get(item.itemId)?.comment,
  }));
}

function toError(error: AttemptDomainError): ReviewAttemptError {
  return error instanceof ReviewCommentRequiredError ? { code: 'RETURN_REQUIRES_COMMENT' } : error;
}
