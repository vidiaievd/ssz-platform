import { Inject, Logger, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AiGateway, type GatewayCall } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { describeCall } from '../../../application/describe-call.js';
import { commentLanguage } from '../../domain/comment-language.js';
import { enabledAspects } from '../../domain/review-aspect.js';
import { toReviewDraft, type TranslateReviewInput } from '../../domain/translate-review.js';
import { reviewRequest } from '../../prompts/prompts.js';
import { REVIEW_DRAFT } from '../../review-draft.capability.js';
import {
  REVIEW_ATTEMPTS_CLIENT,
  type DraftToWrite,
  type DraftWriteMeta,
  type IReviewAttemptsClient,
  type TranslateSubject,
} from '../ports/review-attempts.client.js';
import { SCHOOL_LANGUAGE_READER, type ISchoolLanguageReader } from '../ports/school-language.reader.js';
import { SchoolPayerResolver } from '../school-payer.resolver.js';
import { DraftReviewCommand } from './draft-review.command.js';

/** Templates with a review prompt — the first wave; the rest join in step 1.7. */
const FIRST_WAVE = ['translate_to_target', 'translate_from_target'];

/** The ledger's surface for drafts written into the teacher's queue. */
export const REVIEW_QUEUE_SURFACE = 'review_queue';

export type DraftReviewOutcome =
  /** Nothing asked of a model: the reason, for the log. */
  | { kind: 'skipped'; reason: string }
  /** The gateway answered without a model: switched off, refused, unavailable. No draft. */
  | { kind: 'not_called'; outcome: string; errorCode: string | null; aiCallId: string }
  /** A model answered (or failed); the draft went to the engine — or the engine turned it down. */
  | { kind: 'written'; status: DraftToWrite['status']; remarks: number; aiCallId: string }
  | { kind: 'refused_by_engine'; code: string; aiCallId: string }
  /** The engine could not take the draft even on a retry: the call is in the ledger, the draft is not. */
  | { kind: 'write_failed'; aiCallId: string };

const WRITE_ATTEMPTS = 2;
/** Pause before the second write; a token so tests need not wait. */
export const DRAFT_WRITE_RETRY_MS = Symbol('DRAFT_WRITE_RETRY_MS');

/**
 * The teacher's draft of a review (plan 79, step 1.3): a submission routed to a school's
 * queue → the submission beside its key, from exercise-engine → the gateway under the
 * school's tariff → the verified remarks back onto the attempt.
 *
 * Any stage that stops leaves the queue as it was: no draft, or a `failed` one without text
 * when a model was called and its answer could not be used. A refusal (key off, quota) is not
 * a failed draft — no model was asked — so nothing is written; the ledger row says why.
 */
@CommandHandler(DraftReviewCommand)
export class DraftReviewHandler implements ICommandHandler<DraftReviewCommand, DraftReviewOutcome> {
  private readonly logger = new Logger(DraftReviewHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    private readonly payers: SchoolPayerResolver,
    @Inject(REVIEW_ATTEMPTS_CLIENT) private readonly attempts: IReviewAttemptsClient,
    @Inject(SCHOOL_LANGUAGE_READER) private readonly schools: ISchoolLanguageReader,
    @Optional() @Inject(DRAFT_WRITE_RETRY_MS) private readonly writeRetryMs: number = 1_000,
  ) {}

  async execute(command: DraftReviewCommand): Promise<DraftReviewOutcome> {
    // Cheap filters first, from the event alone: no call to anyone.
    if (!FIRST_WAVE.includes(command.templateCode)) return { kind: 'skipped', reason: 'template_not_in_first_wave' };
    if (command.schoolId === null) return { kind: 'skipped', reason: 'no_school' };

    const found = await this.attempts.getSubject(command.attemptId);
    if (!found) return { kind: 'skipped', reason: 'attempt_not_found' };
    if (found.skip || !found.subject) return { kind: 'skipped', reason: (found.skip ?? 'no_subject').toLowerCase() };
    // The attempt's own school, not the event's: the engine's row is the truth.
    if (found.schoolId === null) return { kind: 'skipped', reason: 'no_school' };

    const subject = found.subject;
    if (!subject.ai.on) return { kind: 'skipped', reason: 'ai_off' };
    const aspects = enabledAspects(subject.ai.checks);
    if (aspects.length === 0) return { kind: 'skipped', reason: 'no_checks' };
    if (subject.sentences.every((s) => s.answer.trim() === '')) return { kind: 'skipped', reason: 'empty_answer' };

    const input: TranslateReviewInput = {
      langs: subject.langs,
      commentLanguage: commentLanguage(await this.schoolLanguage(found.schoolId), subject.langs.explain),
      aspects,
      sentences: toSentences(subject),
    };

    const context: CallContext = {
      payer: await this.payers.resolve({ schoolId: found.schoolId }),
      actor: { userId: found.userId, role: null },
      surface: REVIEW_QUEUE_SURFACE,
    };
    const call = await this.gateway.call(REVIEW_DRAFT.code, context, (promptVersion) =>
      reviewRequest(promptVersion, { template: 'translate', input }),
    );
    const report = describeCall(REVIEW_DRAFT.code, context, call);

    // No model reached: switched off, refused by the gate, every model skipped.
    if (report.answeredBy === null) {
      return { kind: 'not_called', outcome: report.outcome, errorCode: report.errorCode, aiCallId: report.callId };
    }

    const draft: DraftToWrite =
      report.outcome === 'ok' && report.output?.kind === 'structured'
        ? { status: 'ready', ...toReviewDraft(report.output.data, input) }
        : { status: 'failed', errorCode: report.errorCode ?? 'invalid_response' };
    const meta = {
      aiCallId: report.callId,
      providerId: calledProviderId(call),
      modelId: report.answeredBy.modelId,
      promptVersion: report.promptVersion,
    };
    const written = await this.write(command.attemptId, draft, meta);
    if (written === null) return { kind: 'write_failed', aiCallId: report.callId };
    if (!written.written) return { kind: 'refused_by_engine', code: written.code, aiCallId: report.callId };
    return {
      kind: 'written',
      status: draft.status,
      remarks: draft.status === 'ready' ? draft.items.length : 0,
      aiCallId: report.callId,
    };
  }

  /**
   * The model was paid for by now, so a failed write is retried here rather than by
   * redelivering the event — a redelivery would ask the model again. Null after the retry.
   */
  private async write(
    attemptId: string,
    draft: DraftToWrite,
    meta: DraftWriteMeta,
  ): Promise<Awaited<ReturnType<IReviewAttemptsClient['putDraft']>> | null> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.attempts.putDraft(attemptId, draft, meta);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= WRITE_ATTEMPTS) {
          this.logger.error(`Draft of ${attemptId} (call ${meta.aiCallId}) lost: ${message}`);
          return null;
        }
        this.logger.warn(`Draft of ${attemptId} not written, retrying: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, this.writeRetryMs));
      }
    }
  }

  /** The language is a nicety, not a precondition: unreadable → the exercise's own label. */
  private async schoolLanguage(schoolId: string): Promise<string | null> {
    try {
      return await this.schools.explanationLanguage(schoolId);
    } catch (err) {
      this.logger.warn(`Explanation language of school ${schoolId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

function calledProviderId({ routed }: GatewayCall): string | null {
  if (routed.isOk) return routed.value.model.model.providerId;
  return routed.error.kind === 'error' ? routed.error.model.model.providerId : null;
}

function toSentences(subject: TranslateSubject): TranslateReviewInput['sentences'] {
  return subject.sentences.map((s) => ({
    itemId: s.itemId,
    direction: s.direction,
    source: s.source,
    refs: s.refs,
    answer: s.answer,
    ...(s.explanation ? { explanation: s.explanation } : {}),
    ...(s.teacherNote ? { teacherNote: s.teacherNote } : {}),
  }));
}
