import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ReviewScoring } from '../../../../attempts/application/services/review-scoring.js';
import { publishAttemptEvents } from '../../../../attempts/application/services/review-verdict.js';
import type { Attempt, ReviewVerdict } from '../../../../attempts/domain/entities/attempt.entity.js';
import { ReviewCommentRequiredError } from '../../../../attempts/domain/exceptions/attempt.errors.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import { decisionsUnderMachine, marksOf, type AiVerdict } from '../../../domain/ai-verdict.js';
import { ATTEMPT_AI_REVIEWED, aiReviewedPayload } from '../../../domain/events/ai-review-events.js';
import {
  AttemptAiDraft,
  draftRefusal,
  type DraftRefusal,
} from '../../../domain/entities/attempt-ai-draft.entity.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { hasReviewPrompt } from '../../queries/get-review-subject/review-subject.js';
import { PutAiReviewCommand } from './put-ai-review.command.js';

export type PutAiReviewError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: Exclude<DraftRefusal, 'NO_TEACHER_REVIEW'> }
  /** No review prompt for this template: nothing should have been asked. */
  | { code: 'TEMPLATE_NOT_SUPPORTED' }
  /** A `ready` review without its verdict. */
  | { code: 'VERDICT_MISSING' }
  /** Items the machine left open, or rubric criteria, the verdict says nothing about. */
  | { code: 'VERDICT_INCOMPLETE'; missing: string[] }
  /** Sent back with nothing said about why. */
  | { code: 'RETURN_REQUIRES_COMMENT' }
  /** The exercise could not be read to recompute what the machine closed. */
  | { code: 'CONTENT_UNAVAILABLE' }
  | { code: 'AI_CALL_ID_REUSED' }
  /** Another write on this attempt landed in between — a retry answers from it. */
  | { code: 'CONCURRENT_WRITE' };

export interface PutAiReviewResult {
  draft: AttemptAiDraft;
  /** Where the attempt stands after the write: unchanged by a `FAILED` draft. */
  attempt: { status: Attempt['status']; score: number | null; passed: boolean | null };
}

const CAPABILITY = 'review_direct';

/**
 * A model's review of the work of a learner nobody reviews, and its verdict (plan 79,
 * step 2.1b). The review is stored beside the teacher's drafts (`review_direct`); the verdict
 * closes the attempt as a teacher's would, with `reviewedBy: 'ai'` on what it publishes.
 *
 * What the verdict counts follows Q4-C (`decisionsUnderMachine`): the auto-check decides every
 * item it closed, the model the rest. An essay is ruled by the model's marks against the
 * rubric frozen on the attempt, as a teacher's are — its `outcome` is not read.
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
  ) {}

  async execute(command: PutAiReviewCommand): Promise<Result<PutAiReviewResult, PutAiReviewError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });

    const stored = await this.drafts.findByAiCallId(command.draft.aiCallId);
    if (stored && (stored.attemptId !== command.attemptId || stored.capability !== CAPABILITY)) {
      return Result.fail({ code: 'AI_CALL_ID_REUSED' });
    }
    // The same call again, and nothing left of it to do.
    if (stored && (stored.status === 'FAILED' || attempt.status !== 'ROUTED_FOR_REVIEW')) {
      return Result.ok(view(stored, attempt));
    }

    const refusal = draftRefusal(attempt, CAPABILITY);
    if (refusal) return Result.fail({ code: refusal as Exclude<DraftRefusal, 'NO_TEACHER_REVIEW'> });
    if (!hasReviewPrompt(attempt.templateCode)) return Result.fail({ code: 'TEMPLATE_NOT_SUPPORTED' });

    if (command.draft.status === 'READY') {
      if (command.verdict === null) return Result.fail({ code: 'VERDICT_MISSING' });
      const ruled = await this.rule(attempt, command.draft, command.verdict);
      if (ruled.isFail) return Result.fail(ruled.error);
    }

    // A retry of a write cut off after the review was saved: it is there, only the verdict is not.
    let draft = stored;
    if (draft === null) {
      const now = new Date();
      const existing = await this.drafts.findByAttempt(command.attemptId, CAPABILITY);
      if (existing) {
        if (existing.replaceWith(command.draft, now)) return Result.fail({ code: 'CONCURRENT_WRITE' });
        draft = existing;
      } else {
        draft = AttemptAiDraft.propose(command.attemptId, CAPABILITY, command.draft, now);
      }
      if ((await this.drafts.save(draft)) === 'conflict') return Result.fail({ code: 'CONCURRENT_WRITE' });
    }

    if (draft.status === 'READY') {
      await this.attempts.save(attempt);
      await publishAttemptEvents(this.publisher, attempt);
      // The count a dispute rate is read against (2.3b), once the verdict has landed.
      await this.publisher.publish(ATTEMPT_AI_REVIEWED, aiReviewedPayload(attempt, draft, new Date()));
    }
    return Result.ok(view(draft, attempt));
  }

  /** Applies the verdict to the attempt, in memory — the caller saves it after the review. */
  private async rule(
    attempt: Attempt,
    draft: PutAiReviewCommand['draft'],
    verdict: AiVerdict,
  ): Promise<Result<void, PutAiReviewError>> {
    const comment = (draft.summary ?? '').trim() === '' ? null : draft.summary;
    let ruling: Omit<ReviewVerdict, 'aiDraft'>;

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

    const reviewed = attempt.reviewByAi(ruling);
    if (reviewed.isFail) {
      return Result.fail(
        reviewed.error instanceof ReviewCommentRequiredError
          ? { code: 'RETURN_REQUIRES_COMMENT' }
          : { code: 'ATTEMPT_NOT_IN_REVIEW' },
      );
    }
    return Result.ok(undefined);
  }
}

function view(draft: AttemptAiDraft, attempt: Attempt): PutAiReviewResult {
  return { draft, attempt: { status: attempt.status, score: attempt.scoreValue, passed: attempt.passed } };
}
