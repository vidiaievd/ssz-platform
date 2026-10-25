import { Inject, Logger, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AiGateway, type GatewayCall } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { describeCall, type CallReport } from '../../../application/describe-call.js';
import { REVIEW_QUEUE_SURFACE } from '../../../review-draft/application/draft-review/draft-review.handler.js';
import type { DraftWriteMeta } from '../../../review-draft/application/ports/review-attempts.client.js';
import {
  SCHOOL_LANGUAGE_READER,
  type ISchoolLanguageReader,
} from '../../../review-draft/application/ports/school-language.reader.js';
import { unaskable } from '../../../review-draft/application/review-input.js';
import { SchoolPayerResolver } from '../../../review-draft/application/school-payer.resolver.js';
import { toDirectReview } from '../../domain/direct-review.js';
import { directReviewRequest } from '../../prompts/prompts.js';
import { REVIEW_DIRECT } from '../../review-direct.capability.js';
import { toDirectSubject } from '../direct-subject.js';
import { LearnerPayerResolver } from '../learner-payer.resolver.js';
import {
  DIRECT_REVIEW_ATTEMPTS_CLIENT,
  type GiveUpReason,
  type IDirectReviewAttemptsClient,
  type ReviewToWrite,
} from '../ports/direct-review-attempts.client.js';
import { LEARNER_LANGUAGE_READER, type ILearnerLanguageReader } from '../ports/learner-language.reader.js';
import { DirectReviewCommand } from './direct-review.command.js';

/** The ledger's surface for reviews a learner gets without a teacher. */
export const SELF_STUDY_SURFACE = 'self_study';

/** Engine skips that will never turn into something to ask: the attempt would wait forever. */
const UNASKABLE_SKIPS = new Set(['TEMPLATE_NOT_SUPPORTED', 'EXERCISE_GONE']);

/** Gateway outcomes where no model was asked because the payer may not ask one. */
const REFUSED_OUTCOMES = new Set<CallReport['outcome']>(['disabled', 'refused_policy', 'refused_quota']);

export type DirectReviewOutcome =
  /** Nothing to do: decided meanwhile, or a teacher reviews it. The reason, for the log. */
  | { kind: 'skipped'; reason: string }
  /** The verdict closed the attempt — or, `provisional`, waits beside it for the school's teacher. */
  | { kind: 'ruled'; attemptStatus: string; provisional: boolean; remarks: number; aiCallId: string }
  /**
   * Nobody will review the work, so it is closed as `NO_REVIEWER` — or would have been:
   * `engine` is `closed`, the engine's refusal code, or `lost` when it could not be reached.
   */
  | { kind: 'gave_up'; reason: GiveUpReason; cause: string; aiCallId: string | null; engine: string }
  /**
   * A school's work with no verdict from the model (plan 80, step 3c): nothing to close, its
   * teacher reads it as without the policy. `cause` and the call, for the log.
   */
  | { kind: 'left_to_teacher'; cause: string; aiCallId: string | null };

const WRITE_ATTEMPTS = 2;
/** Pause before the second write; a token so tests need not wait. */
export const DIRECT_WRITE_RETRY_MS = Symbol('DIRECT_WRITE_RETRY_MS');

/**
 * A learner's own review (plan 79, step 2.2c): a submission routed with no school → the
 * submission beside its key, from exercise-engine → the gateway under the learner's tariff
 * (`ai.review_direct`) → the review and its verdict back onto the attempt, which closes it.
 *
 * Unlike the teacher's draft, stopping is not free here: nobody else will read the work, so
 * every way out that leaves no verdict — the gate refused, nothing to ask, no usable answer —
 * closes the attempt as `NO_REVIEWER` rather than leave it waiting for review forever.
 *
 * At a school that has a model answer first (plan 80, step 3c) the same review is asked for
 * with the school as payer (its `ai.review_direct` credits), in the school's explanation
 * language, on the `review_queue` surface; the engine decides whether the verdict counts or
 * waits for the teacher. Here stopping is free again: the work stays in the teacher's queue
 * and nothing is closed. Whether the school has the policy is the engine's to say — it
 * answers `HAS_TEACHER_REVIEW` for work without one.
 */
@CommandHandler(DirectReviewCommand)
export class DirectReviewHandler implements ICommandHandler<DirectReviewCommand, DirectReviewOutcome> {
  private readonly logger = new Logger(DirectReviewHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    private readonly payers: LearnerPayerResolver,
    private readonly schoolPayers: SchoolPayerResolver,
    @Inject(DIRECT_REVIEW_ATTEMPTS_CLIENT) private readonly attempts: IDirectReviewAttemptsClient,
    @Inject(LEARNER_LANGUAGE_READER) private readonly learners: ILearnerLanguageReader,
    @Inject(SCHOOL_LANGUAGE_READER) private readonly schools: ISchoolLanguageReader,
    @Optional() @Inject(DIRECT_WRITE_RETRY_MS) private readonly writeRetryMs: number = 1_000,
  ) {}

  async execute(command: DirectReviewCommand): Promise<DirectReviewOutcome> {
    // The template list is the engine's to keep: it answers TEMPLATE_NOT_SUPPORTED, and that
    // attempt is given up on rather than skipped from the event and left waiting.
    const found = await this.attempts.getSubject(command.attemptId);
    if (!found) return { kind: 'skipped', reason: 'attempt_not_found' };
    // The attempt's own school, not the event's: the engine's row is the truth.
    if (found.schoolId !== command.schoolId) return { kind: 'skipped', reason: 'school_differs_from_event' };
    const schoolId = found.schoolId;
    if (schoolId !== null) {
      // A redelivery after the verdict, or a run cut off after a failed review: the teacher has it.
      if (found.skip || !found.subject) return { kind: 'skipped', reason: (found.skip ?? 'no_subject').toLowerCase() };
    } else if (found.skip) {
      const cause = found.skip.toLowerCase();
      if (UNASKABLE_SKIPS.has(found.skip)) return this.giveUp(command.attemptId, null, 'unaskable', cause, null);
      // A review stored by a run cut off before its verdict or its give-up: a failed one is
      // closed now; a ready one the engine refuses to close (REVIEW_EXISTS), and the log says so.
      if (found.skip === 'DRAFT_EXISTS') return this.giveUp(command.attemptId, null, 'failed', cause, null);
      return { kind: 'skipped', reason: cause };
    }
    if (!found.subject) return { kind: 'skipped', reason: 'no_subject' };

    const unasked = unaskable(found.subject);
    if (unasked) return this.giveUp(command.attemptId, schoolId, 'unaskable', unasked, null);

    const language = schoolId === null ? await this.learnerLanguage(found.userId) : await this.schoolLanguage(schoolId);
    const subject = toDirectSubject(found.subject, language);

    const context: CallContext = {
      payer:
        schoolId === null
          ? await this.payers.resolve({ userId: found.userId })
          : await this.schoolPayers.resolve({ schoolId }),
      actor: { userId: found.userId, role: null },
      surface: schoolId === null ? SELF_STUDY_SURFACE : REVIEW_QUEUE_SURFACE,
    };
    const call = await this.gateway.call(REVIEW_DIRECT.code, context, (promptVersion) =>
      directReviewRequest(promptVersion, subject),
    );
    const report = describeCall(REVIEW_DIRECT.code, context, call);

    // No model reached: switched off or refused by the gate — or every model skipped, or the
    // tariff unreadable, which nobody retries later either.
    if (report.answeredBy === null) {
      const reason = REFUSED_OUTCOMES.has(report.outcome) ? 'refused' : 'failed';
      return this.giveUp(command.attemptId, schoolId, reason, report.errorCode ?? report.outcome, report.callId);
    }

    const review: ReviewToWrite =
      report.outcome === 'ok' && report.output?.kind === 'structured'
        ? { status: 'ready', ...toDirectReview(report.output.data, subject.input) }
        : { status: 'failed', errorCode: report.errorCode ?? 'invalid_response' };
    const meta: DraftWriteMeta = {
      aiCallId: report.callId,
      providerId: calledProviderId(call),
      modelId: report.answeredBy.modelId,
      promptVersion: report.promptVersion,
    };
    const written = await this.retried(`Review of ${command.attemptId} (call ${meta.aiCallId})`, () =>
      this.attempts.putReview(command.attemptId, review, meta),
    );
    if (written === null) return this.giveUp(command.attemptId, schoolId, 'failed', 'review_write_lost', report.callId);
    // A ready review turned down (a verdict the engine cannot rule by) is not stored: as good as no answer.
    if (!written.written) {
      return this.giveUp(command.attemptId, schoolId, 'failed', `engine_${written.code.toLowerCase()}`, report.callId);
    }
    if (review.status === 'failed') return this.giveUp(command.attemptId, schoolId, 'failed', review.errorCode, report.callId);
    return {
      kind: 'ruled',
      attemptStatus: written.attemptStatus,
      provisional: written.provisional,
      remarks: review.items.length,
      aiCallId: report.callId,
    };
  }

  /**
   * Closes the attempt as `NO_REVIEWER`; the outcome says whether the engine took it. A
   * school's work is not closed — its teacher is still there to read it.
   */
  private async giveUp(
    attemptId: string,
    schoolId: string | null,
    reason: GiveUpReason,
    cause: string,
    aiCallId: string | null,
  ): Promise<DirectReviewOutcome> {
    if (schoolId !== null) return { kind: 'left_to_teacher', cause, aiCallId };
    const closed = await this.retried(`Give-up on ${attemptId}`, () => this.attempts.giveUp(attemptId, reason, aiCallId));
    const engine = closed === null ? 'lost' : closed.closed ? 'closed' : closed.code;
    return { kind: 'gave_up', reason, cause, aiCallId, engine };
  }

  /**
   * Once a model was paid for, a failed write is retried here rather than by redelivering
   * the event — a redelivery would ask the model again. Null after the retry.
   */
  private async retried<T>(label: string, write: () => Promise<T>): Promise<T | null> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await write();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= WRITE_ATTEMPTS) {
          this.logger.error(`${label} lost: ${message}`);
          return null;
        }
        this.logger.warn(`${label} not written, retrying: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, this.writeRetryMs));
      }
    }
  }

  /** As the learner's: a nicety, the exercise's own label when unreadable. */
  private async schoolLanguage(schoolId: string): Promise<string | null> {
    try {
      return await this.schools.explanationLanguage(schoolId);
    } catch (err) {
      this.logger.warn(`Explanation language of school ${schoolId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** The language is a nicety, not a precondition: unreadable → the exercise's own label. */
  private async learnerLanguage(userId: string): Promise<string | null> {
    try {
      return await this.learners.interfaceLanguage(userId);
    } catch (err) {
      this.logger.warn(`Interface language of ${userId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

function calledProviderId({ routed }: GatewayCall): string | null {
  if (routed.isOk) return routed.value.model.model.providerId;
  return routed.error.kind === 'error' ? routed.error.model.model.providerId : null;
}
