import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Logger, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AiGateway, type GatewaySpeechCall } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import type { DraftWriteMeta } from '../../../review-draft/application/ports/review-attempts.client.js';
import { REVIEW_QUEUE_SURFACE } from '../../../review-draft/application/draft-review/draft-review.handler.js';
import { SchoolPayerResolver } from '../../../review-draft/application/school-payer.resolver.js';
import { SELF_STUDY_SURFACE } from '../../../review-direct/application/direct-review/direct-review.handler.js';
import { LearnerPayerResolver } from '../../../review-direct/application/learner-payer.resolver.js';
import type { GiveUpReason } from '../../../review-direct/application/ports/direct-review-attempts.client.js';
import type { ReadAloudSubject } from '../../domain/read-aloud-subject.js';
import { VOICE_REVIEW, VOICE_REVIEW_PRONUNCIATION } from '../../voice-review.capability.js';
import { RECORDING_AUDIO_SOURCE, type IRecordingAudioSource } from '../ports/recording-audio.source.js';
import {
  VOICE_REVIEW_ATTEMPTS_CLIENT,
  type IVoiceReviewAttemptsClient,
  type PromptHearing,
  type ReadingToWrite,
} from '../ports/voice-review-attempts.client.js';
import { VoiceReviewCommand } from './voice-review.command.js';

/** Engine skips that will never turn into something to hear: the attempt would wait forever. */
const UNASKABLE_SKIPS = new Set(['TEMPLATE_NOT_SUPPORTED', 'EXERCISE_GONE']);

export type VoiceReviewOutcome =
  /** Nothing to do: decided meanwhile, or a teacher reviews it. The reason, for the log. */
  | { kind: 'skipped'; reason: string }
  /** The reading was heard and ruled on — or, `provisional`, waits beside it for the school's teacher. */
  | { kind: 'ruled'; attemptStatus: string; provisional: boolean; capability: string; aiCallIds: string[] }
  /**
   * Nobody will review the reading, so it is closed as `NO_REVIEWER` — or would have been:
   * `engine` is `closed`, the engine's refusal code, or `lost` when it could not be reached.
   */
  | { kind: 'gave_up'; reason: GiveUpReason; cause: string; aiCallId: string | null; engine: string }
  /** A school's reading with nothing heard: its teacher listens to it as without the policy. */
  | { kind: 'left_to_teacher'; cause: string; aiCallId: string | null };

const WRITE_ATTEMPTS = 2;
/** Pause before the second write; a token so tests need not wait. */
export const VOICE_WRITE_RETRY_MS = Symbol('VOICE_WRITE_RETRY_MS');
/**
 * Pauses between asks for recordings media is still converting. A take is uploaded, then
 * submitted — the speech variant may be seconds behind the event. A token for tests.
 */
export const VOICE_RECORDING_WAITS_MS = Symbol('VOICE_RECORDING_WAITS_MS');
const DEFAULT_RECORDING_WAITS_MS = [5_000, 10_000, 15_000];

/** How a prompt's call ended, as the reading needs it. */
type Heard =
  | { kind: 'heard'; hearing: PromptHearing; call: GatewaySpeechCall }
  /** No model reached: switched off, refused by the gate, every model skipped. */
  | { kind: 'not_called'; reason: GiveUpReason; cause: string; callId: string }
  /** A model was called and failed. */
  | { kind: 'failed'; errorCode: string; call: GatewaySpeechCall };

/**
 * A reading aloud heard by a speech model (plan 82, step 8): a submission routed with no
 * school → the passages and takes from exercise-engine (`voice_review` subject) → every take's
 * speech WAV from media → one gateway call per prompt under the payer's tariff → what was heard
 * back to the engine, which checks it against the passages and rules (step 7). The model
 * never rules: there is no verdict to send.
 *
 * Level: the pronunciation model (`voice_review_pronunciation`) when the author asked for
 * pronunciation and the payer may call it; else the recognizer (`voice_review`). A refusal of
 * the first — its credits spent — drops to the second rather than leave the reading unheard.
 *
 * Every take is fetched before the first call: a reading missing one cannot be ruled, and
 * nothing is paid for it. Then, as for a learner's text review, every way out without a
 * verdict closes the attempt as `NO_REVIEWER`; at a school (plan 80) it is left to the teacher.
 */
@CommandHandler(VoiceReviewCommand)
export class VoiceReviewHandler implements ICommandHandler<VoiceReviewCommand, VoiceReviewOutcome> {
  private readonly logger = new Logger(VoiceReviewHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    private readonly payers: LearnerPayerResolver,
    private readonly schoolPayers: SchoolPayerResolver,
    @Inject(VOICE_REVIEW_ATTEMPTS_CLIENT) private readonly attempts: IVoiceReviewAttemptsClient,
    @Inject(RECORDING_AUDIO_SOURCE) private readonly recordings: IRecordingAudioSource,
    @Optional() @Inject(VOICE_WRITE_RETRY_MS) private readonly writeRetryMs: number = 1_000,
    @Optional() @Inject(VOICE_RECORDING_WAITS_MS) private readonly recordingWaitsMs: number[] = DEFAULT_RECORDING_WAITS_MS,
  ) {}

  async execute(command: VoiceReviewCommand): Promise<VoiceReviewOutcome> {
    const found = await this.attempts.getSubject(command.attemptId);
    if (!found) return { kind: 'skipped', reason: 'attempt_not_found' };
    // The attempt's own school, not the event's: the engine's row is the truth.
    if (found.schoolId !== command.schoolId) return { kind: 'skipped', reason: 'school_differs_from_event' };
    const schoolId = found.schoolId;
    if (schoolId !== null) {
      if (found.skip || !found.subject) return { kind: 'skipped', reason: (found.skip ?? 'no_subject').toLowerCase() };
    } else if (found.skip) {
      const cause = found.skip.toLowerCase();
      if (UNASKABLE_SKIPS.has(found.skip)) return this.giveUp(command.attemptId, null, 'unaskable', cause, null);
      // A reading stored by a run cut off before its verdict: a failed one is closed now.
      if (found.skip === 'DRAFT_EXISTS') return this.giveUp(command.attemptId, null, 'failed', cause, null);
      return { kind: 'skipped', reason: cause };
    }
    if (!found.subject) return { kind: 'skipped', reason: 'no_subject' };
    const subject = found.subject;
    // `read` mode with the transcript check and a passage on every prompt — else nothing to hear against.
    if (!subject.ai.on || subject.prompts.length === 0) {
      return this.giveUp(command.attemptId, schoolId, 'unaskable', 'machine_cannot_check', null);
    }

    const takes = await this.takes(subject);
    if (takes.kind !== 'ready') {
      return this.giveUp(command.attemptId, schoolId, 'failed', `recording_${takes.kind}`, null);
    }

    const context: CallContext = {
      payer:
        schoolId === null
          ? await this.payers.resolve({ userId: found.userId })
          : await this.schoolPayers.resolve({ schoolId }),
      actor: { userId: found.userId, role: null },
      surface: schoolId === null ? SELF_STUDY_SURFACE : REVIEW_QUEUE_SURFACE,
    };
    let capability =
      subject.ai.checks.pronunciation && (await this.gateway.available(VOICE_REVIEW_PRONUNCIATION.code, context.payer))
        ? VOICE_REVIEW_PRONUNCIATION.code
        : VOICE_REVIEW.code;

    const hearings: PromptHearing[] = [];
    const calls: GatewaySpeechCall[] = [];
    for (const prompt of subject.prompts) {
      let heard = await this.hear(capability, context, subject, prompt.itemId, prompt.text, takes.wavs.get(prompt.itemId)!);
      if (heard.kind === 'not_called' && heard.reason === 'refused' && capability !== VOICE_REVIEW.code) {
        this.logger.warn(`Pronunciation level refused for ${command.attemptId} (${heard.cause}); hearing it plainly`);
        capability = VOICE_REVIEW.code;
        heard = await this.hear(capability, context, subject, prompt.itemId, prompt.text, takes.wavs.get(prompt.itemId)!);
      }
      if (heard.kind === 'not_called') return this.giveUp(command.attemptId, schoolId, heard.reason, heard.cause, heard.callId);
      if (heard.kind === 'failed') {
        // Stored as a failed review, so a redelivery stops at DRAFT_EXISTS instead of paying again.
        await this.write(command.attemptId, { status: 'failed', errorCode: heard.errorCode }, metaOf(heard.call));
        return this.giveUp(command.attemptId, schoolId, 'failed', heard.errorCode, heard.call.recorded.callId);
      }
      hearings.push(heard.hearing);
      calls.push(heard.call);
    }

    // The first prompt's call stands for the review — its key at the engine; every prompt
    // carries its own call in what was heard.
    const meta = metaOf(calls[0]!);
    const lastCallId = calls[calls.length - 1]!.recorded.callId;
    const written = await this.write(command.attemptId, { status: 'ready', prompts: hearings }, meta);
    if (written === null) return this.giveUp(command.attemptId, schoolId, 'failed', 'reading_write_lost', lastCallId);
    if (!written.written) {
      return this.giveUp(command.attemptId, schoolId, 'failed', `engine_${written.code.toLowerCase()}`, lastCallId);
    }
    return {
      kind: 'ruled',
      attemptStatus: written.attemptStatus,
      provisional: written.provisional,
      capability,
      aiCallIds: calls.map((c) => c.recorded.callId),
    };
  }

  private async hear(
    capability: string,
    context: CallContext,
    subject: ReadAloudSubject,
    itemId: string,
    passage: string,
    wav: Uint8Array,
  ): Promise<Heard> {
    const call = await this.gateway.callSpeech(capability, context, {
      audio: { format: 'wav', data: wav },
      referenceText: passage,
      language: subject.targetLanguage,
      pronunciation: capability === VOICE_REVIEW_PRONUNCIATION.code,
    });
    const { routed } = call;
    if (routed.isOk) {
      const { transcript, words, audioMs, pronunciation } = routed.value.result;
      return {
        kind: 'heard',
        hearing: { itemId, transcript, words, audioMs, pronunciation, aiCallId: call.recorded.callId },
        call,
      };
    }
    const failure = routed.error;
    switch (failure.kind) {
      case 'disabled':
        return { kind: 'not_called', reason: 'refused', cause: 'disabled', callId: call.recorded.callId };
      case 'refused':
        return { kind: 'not_called', reason: 'refused', cause: failure.code, callId: call.recorded.callId };
      case 'gate_unavailable':
      case 'unavailable':
        return { kind: 'not_called', reason: 'failed', cause: failure.kind, callId: call.recorded.callId };
      case 'error':
        return { kind: 'failed', errorCode: failure.error.code, call };
    }
  }

  /**
   * Every prompt's speech WAV, asking again while media is still converting a take. Throws when
   * media cannot answer — before any model call, so the event's redelivery is the retry.
   */
  private async takes(
    subject: ReadAloudSubject,
  ): Promise<{ kind: 'ready'; wavs: Map<string, Uint8Array> } | { kind: 'missing' | 'not_ready' }> {
    const wavs = new Map<string, Uint8Array>();
    for (let round = 0; ; round++) {
      let pending = false;
      for (const prompt of subject.prompts) {
        if (wavs.has(prompt.itemId)) continue;
        const audio = await this.recordings.fetch(prompt.assetId);
        if (audio.kind === 'missing') return { kind: 'missing' };
        if (audio.kind === 'pending') pending = true;
        else wavs.set(prompt.itemId, audio.wav);
      }
      if (!pending) return { kind: 'ready', wavs };
      if (round >= this.recordingWaitsMs.length) return { kind: 'not_ready' };
      await sleep(this.recordingWaitsMs[round]);
    }
  }

  /**
   * Closes the attempt as `NO_REVIEWER`; the outcome says whether the engine took it. A
   * school's reading is not closed — its teacher is still there to listen to it.
   */
  private async giveUp(
    attemptId: string,
    schoolId: string | null,
    reason: GiveUpReason,
    cause: string,
    aiCallId: string | null,
  ): Promise<VoiceReviewOutcome> {
    if (schoolId !== null) return { kind: 'left_to_teacher', cause, aiCallId };
    const closed = await this.retried(`Give-up on ${attemptId}`, () => this.attempts.giveUp(attemptId, reason, aiCallId));
    const engine = closed === null ? 'lost' : closed.closed ? 'closed' : closed.code;
    return { kind: 'gave_up', reason, cause, aiCallId, engine };
  }

  private write(attemptId: string, reading: ReadingToWrite, meta: DraftWriteMeta) {
    return this.retried(`Reading of ${attemptId} (call ${meta.aiCallId})`, () => this.attempts.putReading(attemptId, reading, meta));
  }

  /**
   * Once a model was paid for, a failed write is retried here rather than by redelivering
   * the event — a redelivery would hear every take again. Null after the retry.
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
        await sleep(this.writeRetryMs);
      }
    }
  }
}

/** The call a review is written under: its ledger row, the model that answered, the binding's label. */
function metaOf({ routed, recorded }: GatewaySpeechCall): DraftWriteMeta {
  const answered = routed.isOk ? routed.value : routed.error.kind === 'error' ? routed.error : null;
  return {
    aiCallId: recorded.callId,
    providerId: answered?.model.model.providerId ?? null,
    modelId: answered?.model.model.id ?? null,
    promptVersion: answered?.binding.promptVersion ?? null,
  };
}
