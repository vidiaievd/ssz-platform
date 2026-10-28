import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { readSubmission } from '@ssz/shared-kernel/read-aloud';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../../shared/application/ports/content-client.port.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ReviewScoring } from '../../../../attempts/application/services/review-scoring.js';
import { publishAttemptEvents } from '../../../../attempts/application/services/review-verdict.js';
import type {
  AiVerdictLanding,
  AiVerdictModel,
  Attempt,
  ReviewVerdict,
} from '../../../../attempts/domain/entities/attempt.entity.js';
import { ReviewCommentRequiredError } from '../../../../attempts/domain/exceptions/attempt.errors.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import {
  decisionsUnderMachine,
  marksOf,
  rejectsMachineCredit,
  type AiVerdict,
} from '../../../domain/ai-verdict.js';
import { ATTEMPT_AI_REVIEWED, aiReviewedPayload } from '../../../domain/events/ai-review-events.js';
import {
  AttemptAiDraft,
  draftRefusal,
  learnerReviewCapability,
  type DraftRefusal,
  type ProposedDraft,
} from '../../../domain/entities/attempt-ai-draft.entity.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { readingRuling, type DraftReading, type PromptHearing } from '../../../domain/reading-verdict.js';
import { readAloudSubject } from '../../queries/get-review-subject/read-aloud-subject.js';
import { capabilityReads, hasVoiceCheck } from '../../queries/get-review-subject/review-subject.js';
import { PutAiReviewCommand } from './put-ai-review.command.js';

export type PutAiReviewError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: Exclude<DraftRefusal, 'NO_TEACHER_REVIEW' | 'AI_REVIEWS_FIRST'> }
  /** No review prompt and no voice check for this template: nothing should have been asked. */
  | { code: 'TEMPLATE_NOT_SUPPORTED' }
  /** A `ready` review without its verdict. */
  | { code: 'VERDICT_MISSING' }
  /** A `ready` review of a reading without what was heard (plan 82, step 7). */
  | { code: 'READING_MISSING' }
  /**
   * Items the machine left open, rubric criteria, or prompts of a reading nothing was heard
   * for, the verdict says nothing about.
   */
  | { code: 'VERDICT_INCOMPLETE'; missing: string[] }
  /**
   * The exercise no longer lets the machine check the reading — the author turned the check
   * off or left `read` since it was handed in, or no prompt of this try is the machine's.
   */
  | { code: 'MACHINE_CANNOT_CHECK' }
  /** The exercise was deleted: there is no passage to check the reading against. */
  | { code: 'EXERCISE_GONE' }
  /** Sent back with nothing said about why. */
  | { code: 'RETURN_REQUIRES_COMMENT' }
  /** The exercise could not be read to recompute what the machine closed. */
  | { code: 'CONTENT_UNAVAILABLE' }
  | { code: 'AI_CALL_ID_REUSED' }
  /** Another write on this attempt landed in between — a retry answers from it. */
  | { code: 'CONCURRENT_WRITE' };

export interface PutAiReviewResult {
  draft: AttemptAiDraft;
  /**
   * Where the attempt stands after the write: unchanged by a `FAILED` draft. `provisional`
   * — a school's work, still waiting for a teacher, with the model's verdict beside it.
   */
  attempt: {
    status: Attempt['status'];
    score: number | null;
    passed: boolean | null;
    provisional: boolean;
  };
}

/** A ruling, ready to land, and the reading check behind it when it is a reading's. */
interface Ruled {
  landing: AiVerdictLanding;
  reading: DraftReading | null;
}

/**
 * A model's review of a learner's work, and its verdict (plan 79, step 2.1b). The review is
 * stored beside the teacher's drafts (`review_direct`); the verdict closes the attempt as a
 * teacher's would, with `reviewedBy: 'ai'` on what it publishes.
 *
 * At a school that lets a model answer first (plan 80, step 3b) the verdict mostly does not
 * close anything: it is kept on the attempt as provisional, the learner reads the review at
 * once, and the work stays in the teacher's queue with the same review as their draft. Which
 * of the two happens is the attempt's decision (`Attempt.reviewByAi`); nothing is published
 * for a provisional one — progress and memory wait for the verdict that counts.
 *
 * What the verdict counts follows Q4-C (`decisionsUnderMachine`): the auto-check decides every
 * item it closed, the model the rest. An essay is ruled by the model's marks against the
 * rubric frozen on the attempt, as a teacher's are — its `outcome` is not read.
 *
 * A `read_aloud` reading (plan 82, step 7) is the voice check's (`voice_review`): ai-service
 * sends what the recognizer heard in each prompt and no verdict at all — the engine checks it
 * against the passages with the kernel's reading check and rules from that (`readingRuling`),
 * the machine deciding in full, by the same spirit as Q4-C. The check is kept on the review
 * for the learner's panel and the teacher's card.
 *
 * Idempotent on `aiCallId`. The review is saved before the attempt, so a write cut off
 * between the two is finished by its retry rather than refused as a duplicate. A `FAILED`
 * draft records that there is no review and leaves the attempt waiting.
 */
@CommandHandler(PutAiReviewCommand)
export class PutAiReviewHandler implements ICommandHandler<PutAiReviewCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
    private readonly scoring: ReviewScoring,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CONTENT_CLIENT) private readonly content: IContentClient,
  ) {}

  async execute(command: PutAiReviewCommand): Promise<Result<PutAiReviewResult, PutAiReviewError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    const capability = learnerReviewCapability(attempt.templateCode);

    const stored = await this.drafts.findByAiCallId(command.draft.aiCallId);
    if (stored && (stored.attemptId !== command.attemptId || stored.capability !== capability)) {
      return Result.fail({ code: 'AI_CALL_ID_REUSED' });
    }
    // The same call again, and nothing left of it to do.
    if (
      stored &&
      (stored.status === 'FAILED' ||
        attempt.status !== 'ROUTED_FOR_REVIEW' ||
        attempt.provisionalAiVerdict !== null)
    ) {
      return Result.ok(view(stored, attempt));
    }

    const refusal = draftRefusal(attempt, capability);
    if (refusal) {
      return Result.fail({ code: refusal as Exclude<DraftRefusal, 'NO_TEACHER_REVIEW' | 'AI_REVIEWS_FIRST'> });
    }
    if (!capabilityReads(capability, attempt.templateCode)) return Result.fail({ code: 'TEMPLATE_NOT_SUPPORTED' });

    let ruled: Ruled | null = null;
    if (command.draft.status === 'READY') {
      const ruling = hasVoiceCheck(attempt.templateCode)
        ? await this.ruleReading(attempt, command.draft, command.reading)
        : await this.rule(attempt, command.draft, command.verdict);
      if (ruling.isFail) return Result.fail(ruling.error);
      ruled = ruling.value;
    }

    // A retry of a write cut off after the review was saved: it is there, only the verdict is not.
    let draft = stored;
    if (draft === null) {
      const now = new Date();
      const proposed: ProposedDraft = { ...command.draft, reading: ruled?.reading ?? null };
      const existing = await this.drafts.findByAttempt(command.attemptId, capability);
      if (existing) {
        if (existing.replaceWith(proposed, now)) return Result.fail({ code: 'CONCURRENT_WRITE' });
        draft = existing;
      } else {
        draft = AttemptAiDraft.propose(command.attemptId, capability, proposed, now);
      }
      if ((await this.drafts.save(draft)) === 'conflict') return Result.fail({ code: 'CONCURRENT_WRITE' });
    }

    if (draft.status === 'READY' && ruled !== null) {
      await this.attempts.save(attempt);
      if (ruled.landing === 'final') {
        await publishAttemptEvents(this.publisher, attempt);
        // The count a dispute rate is read against (2.3b), once the verdict has landed. A
        // provisional one cannot be disputed — a teacher is going to read the work anyway.
        await this.publisher.publish(ATTEMPT_AI_REVIEWED, aiReviewedPayload(attempt, draft, new Date()));
      }
    }
    return Result.ok(view(draft, attempt));
  }

  /** Applies the model's verdict to the attempt, in memory — the caller saves it after the review. */
  private async rule(
    attempt: Attempt,
    draft: ProposedDraft,
    verdict: AiVerdict | null,
  ): Promise<Result<Ruled, PutAiReviewError>> {
    if (verdict === null) return Result.fail({ code: 'VERDICT_MISSING' });
    const comment = commentOf(draft);
    let ruling: Omit<ReviewVerdict, 'aiDraft'>;
    let disagreesWithMachine = false;

    const snapshot = attempt.rubricSnapshot;
    if (snapshot) {
      const marks = marksOf(draft.marks);
      const scored = this.scoring.scoreOf([], [], { snapshot, marks });
      const outcome = scored.rubric;
      if (outcome === null || !outcome.complete) {
        return Result.fail({ code: 'VERDICT_INCOMPLETE', missing: outcome?.missing ?? [] });
      }
      ruling = {
        outcome: outcome.passed ? 'approved' : 'returned',
        decisions: [],
        comment,
        score: scored.score,
        passed: outcome.passed,
        approvedItems: scored.approvedItems,
        totalItems: scored.totalItems,
        rubricMarks: marks,
      };
    } else {
      const auto = await this.scoring.autoOutcomes(attempt);
      if (auto.isFail) return Result.fail({ code: 'CONTENT_UNAVAILABLE' });
      const { decisions, missing } = decisionsUnderMachine(auto.value, verdict.decisions);
      if (missing.length > 0) return Result.fail({ code: 'VERDICT_INCOMPLETE', missing });
      disagreesWithMachine = rejectsMachineCredit(auto.value, verdict.decisions);

      const { approvedItems, totalItems, score } = this.scoring.scoreOf(auto.value, decisions);
      ruling = {
        outcome: verdict.outcome,
        decisions,
        comment,
        score,
        // As a teacher's approval: it passes on the items it credits.
        passed: approvedItems > 0,
        approvedItems,
        totalItems,
      };
    }

    return land(attempt, ruling, { disagreesWithMachine, model: modelOf(draft, 'review_direct') }, null);
  }

  /**
   * The reading's verdict, computed from what was heard against the passages as the review
   * subject reads them (plan 82, step 6) — the same prompts, mark and language ai-service was
   * given. Nothing a recognizer says is a ruling, so there is nothing for it to contradict.
   */
  private async ruleReading(
    attempt: Attempt,
    draft: ProposedDraft,
    heard: PromptHearing[] | null,
  ): Promise<Result<Ruled, PutAiReviewError>> {
    if (heard === null) return Result.fail({ code: 'READING_MISSING' });

    const exercise = await this.content.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (exercise.isFail) {
      return Result.fail({ code: exercise.error.statusCode === 404 ? 'EXERCISE_GONE' : 'CONTENT_UNAVAILABLE' });
    }
    const { content, expectedAnswers } = exercise.value.exercise;
    const subject = readAloudSubject(content, expectedAnswers, attempt.submittedAnswer, attempt.targetLanguage);
    if (!subject.ai.on) return Result.fail({ code: 'MACHINE_CANNOT_CHECK' });

    const result = readingRuling(
      {
        language: subject.targetLanguage,
        passPercent: subject.passPercent,
        fluency: subject.ai.checks.fluency,
        passages: subject.prompts.map((p) => ({ itemId: p.itemId, text: p.text, focus: p.focus })),
        recordings: readSubmission(attempt.submittedAnswer)?.recordings ?? [],
      },
      heard,
    );
    if ('missing' in result) return Result.fail({ code: 'VERDICT_INCOMPLETE', missing: result.missing });

    const ruling = { ...result.ruling, comment: commentOf(draft) };
    return land(attempt, ruling, { model: modelOf(draft, 'voice_review') }, result.reading);
  }
}

/** The verdict onto the attempt, in memory: closed, or provisional beside a school's queue. */
function land(
  attempt: Attempt,
  ruling: Omit<ReviewVerdict, 'aiDraft'>,
  opts: { disagreesWithMachine?: boolean; model: AiVerdictModel },
  reading: DraftReading | null,
): Result<Ruled, PutAiReviewError> {
  const reviewed = attempt.reviewByAi(ruling, opts);
  if (reviewed.isFail) {
    return Result.fail(
      reviewed.error instanceof ReviewCommentRequiredError
        ? { code: 'RETURN_REQUIRES_COMMENT' }
        : { code: 'ATTEMPT_NOT_IN_REVIEW' },
    );
  }
  return Result.ok({ landing: reviewed.value, reading });
}

function commentOf(draft: ProposedDraft): string | null {
  return (draft.summary ?? '').trim() === '' ? null : draft.summary;
}

function modelOf(draft: ProposedDraft, capability: AiVerdictModel['capability']): AiVerdictModel {
  return { capability, modelId: draft.modelId, promptVersion: draft.promptVersion };
}

function view(draft: AttemptAiDraft, attempt: Attempt): PutAiReviewResult {
  return {
    draft,
    attempt: {
      status: attempt.status,
      score: attempt.scoreValue,
      passed: attempt.passed,
      provisional: attempt.pendingAiVerdict() !== null,
    },
  };
}
