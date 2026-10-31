import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Logger, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { AiFeedback } from '@ssz/contracts';
import { AiGateway, type GatewayFailureOf } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import {
  SCHOOL_LANGUAGE_READER,
  type ISchoolLanguageReader,
} from '../../../review-draft/application/ports/school-language.reader.js';
import { SchoolPayerResolver } from '../../../review-draft/application/school-payer.resolver.js';
import { RECORDING_AUDIO_SOURCE, type IRecordingAudioSource } from '../../../voice-review/application/ports/recording-audio.source.js';
import type { ReadAloudSubject } from '../../../voice-review/domain/read-aloud-subject.js';
import { toAiFeedback } from '../../domain/practice-feedback.js';
import { toVoiceFeedback, type PassageHearing } from '../../domain/voice-feedback.js';
import { PRACTICE, PRACTICE_VOICE } from '../../practice.capability.js';
import { practiceRequest } from '../../prompts/prompts.js';
import { practiceUnaskable, toPracticeSubject } from '../practice-subject.js';
import { PrecheckCommand, type PracticeSubject } from './precheck.command.js';
import type { EngineSubject } from '../../../review-draft/application/ports/review-attempts.client.js';

/** The ledger's surface for rehearsals; what the limits of step 3 count by. */
export const PRECHECK_SURFACE = 'precheck';

/**
 * Pauses between asks for takes media is still converting. The learner is waiting on this
 * call, so far shorter than the queue's: a take just uploaded is seconds behind. A token for tests.
 */
export const PRECHECK_RECORDING_WAITS_MS = Symbol('PRECHECK_RECORDING_WAITS_MS');
const DEFAULT_RECORDING_WAITS_MS = [1_000, 2_000];

/**
 * Why no check was made, on purpose:
 * - `unaskable` — nothing to ask about (`detail`: AI off for the exercise, no aspect, empty answer);
 * - `not_available` — the agent is switched off, or the school may not use it (policy, tariff);
 * - `pool_empty` — the school's `ai.practice` credits for the period are spent;
 * - `template_not_supported` — not a template a rehearsal reads.
 *
 * A failure's `errorCode` is the provider's, `gate_unavailable` / `unavailable`, or for a
 * reading `recording_missing` / `recording_not_ready` / `recording_unreadable` (no call made).
 */
export type PrecheckRefusal = 'unaskable' | 'not_available' | 'pool_empty' | 'template_not_supported';

export type PrecheckOutcome =
  | { status: 'ok'; feedback: AiFeedback; aiCallIds: string[] }
  | { status: 'refused'; reason: PrecheckRefusal; detail: string | null }
  /** A model was wanted and none answered usably; the call ids, for the log. */
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };

/**
 * A rehearsal before hand-in (plan 84, step 2): work in progress, sent by exercise-engine,
 * → the gateway under the school's `ai.practice` (surface `precheck`) → hints in the
 * `AiFeedback` shape, straight back to the caller. Nothing is written anywhere but the
 * ledger: the attempt stays in progress, no event, no verdict — the hand-in is the only
 * thing that counts (§3, rule 1).
 *
 * A reading aloud (step 2c) goes to `practice_voice` instead: every take's speech WAV from
 * media, one call per passage, the words heard back as they are. Every take is fetched before
 * the first call, so a reading missing one costs nothing.
 *
 * Whether the school lets its learners rehearse at all, and with which limits, is the
 * engine's to read; the gate here still checks the school's tariff and policy.
 */
@CommandHandler(PrecheckCommand)
export class PrecheckHandler implements ICommandHandler<PrecheckCommand, PrecheckOutcome> {
  private readonly logger = new Logger(PrecheckHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    private readonly schoolPayers: SchoolPayerResolver,
    @Inject(SCHOOL_LANGUAGE_READER) private readonly schools: ISchoolLanguageReader,
    @Inject(RECORDING_AUDIO_SOURCE) private readonly recordings: IRecordingAudioSource,
    @Optional() @Inject(PRECHECK_RECORDING_WAITS_MS) private readonly recordingWaitsMs: number[] = DEFAULT_RECORDING_WAITS_MS,
  ) {}

  async execute({ request }: PrecheckCommand): Promise<PrecheckOutcome> {
    const { subject } = request;
    if (subject.template === 'read_aloud') return this.hearReading(request.schoolId, request.userId, subject);
    if (!isTextSubject(subject)) return refused('template_not_supported', String((subject as { template?: unknown }).template));

    const unasked = practiceUnaskable(subject);
    if (unasked) return refused('unaskable', unasked);

    const prepared = toPracticeSubject(subject, await this.schoolLanguage(request.schoolId));
    const context = await this.contextOf(request.schoolId, request.userId);
    const call = await this.gateway.call(PRACTICE.code, context, (promptVersion) => practiceRequest(promptVersion, prepared));
    const callIds = [call.recorded.callId];

    if (call.routed.isFail) return notAnswered(call.routed.error, callIds);
    const { output } = call.routed.value.result;
    if (output.kind !== 'structured') return { status: 'failed', errorCode: 'invalid_response', aiCallIds: callIds };
    return { status: 'ok', feedback: toAiFeedback(output.data, prepared.input), aiCallIds: callIds };
  }

  private async hearReading(schoolId: string, userId: string, subject: ReadAloudSubject): Promise<PrecheckOutcome> {
    // `read` mode with the transcript check and a passage on every prompt — else nothing to hear against.
    if (!subject.ai.on || subject.prompts.length === 0) return refused('unaskable', 'machine_cannot_check');
    const takes = await this.takes(subject);
    if (takes.kind !== 'ready') return { status: 'failed', errorCode: `recording_${takes.kind}`, aiCallIds: [] };

    const context = await this.contextOf(schoolId, userId);
    const hearings: PassageHearing[] = [];
    const callIds: string[] = [];
    for (const [passageIndex, prompt] of subject.prompts.entries()) {
      const call = await this.gateway.callSpeech(PRACTICE_VOICE.code, context, {
        audio: { format: 'wav', data: takes.wavs.get(prompt.itemId)! },
        referenceText: prompt.text,
        language: subject.targetLanguage,
        pronunciation: subject.ai.checks.pronunciation,
      });
      callIds.push(call.recorded.callId);
      // A passage unheard leaves the reading half-heard: the learner asks again rather than read half.
      if (call.routed.isFail) return notAnswered(call.routed.error, callIds);
      hearings.push({ passageIndex, heard: call.routed.value.result });
    }
    return { status: 'ok', feedback: toVoiceFeedback(hearings), aiCallIds: callIds };
  }

  /** Every take's speech WAV, asking again a little while media is still converting one. */
  private async takes(
    subject: ReadAloudSubject,
  ): Promise<{ kind: 'ready'; wavs: Map<string, Uint8Array> } | { kind: 'missing' | 'not_ready' | 'unreadable' }> {
    const wavs = new Map<string, Uint8Array>();
    for (let round = 0; ; round++) {
      let pending = false;
      for (const prompt of subject.prompts) {
        if (wavs.has(prompt.itemId)) continue;
        let audio;
        try {
          audio = await this.recordings.fetch(prompt.assetId);
        } catch (err) {
          // Nobody redelivers a synchronous call: the learner is told to try again.
          this.logger.warn(`Take ${prompt.assetId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
          return { kind: 'unreadable' };
        }
        if (audio.kind === 'missing') return { kind: 'missing' };
        if (audio.kind === 'pending') pending = true;
        else wavs.set(prompt.itemId, audio.wav);
      }
      if (!pending) return { kind: 'ready', wavs };
      if (round >= this.recordingWaitsMs.length) return { kind: 'not_ready' };
      await sleep(this.recordingWaitsMs[round]);
    }
  }

  private async contextOf(schoolId: string, userId: string): Promise<CallContext> {
    return {
      payer: await this.schoolPayers.resolve({ schoolId }),
      actor: { userId, role: 'student' },
      surface: PRECHECK_SURFACE,
    };
  }

  /** A nicety, as for the draft: unreadable → the exercise's own label. */
  private async schoolLanguage(schoolId: string): Promise<string | null> {
    try {
      return await this.schools.explanationLanguage(schoolId);
    } catch (err) {
      this.logger.warn(`Explanation language of school ${schoolId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

const TEXT_TEMPLATES: ReadonlySet<string> = new Set<EngineSubject['template']>(['translate', 'error_correction', 'writing_task', 'short_answer']);

/** The subject's shape is the engine's and is not validated at the door: the template is checked here. */
function isTextSubject(subject: PracticeSubject): subject is EngineSubject {
  return TEXT_TEMPLATES.has(subject.template);
}

function refused(reason: PrecheckRefusal, detail: string | null): PrecheckOutcome {
  return { status: 'refused', reason, detail };
}

/** A call that reached no usable answer: refused on purpose, or failed. */
export function notAnswered<R>(failure: GatewayFailureOf<R>, aiCallIds: string[]): PrecheckOutcome {
  switch (failure.kind) {
    case 'disabled':
      return refused('not_available', 'disabled');
    case 'refused':
      return failure.code === 'quota_exhausted' ? refused('pool_empty', null) : refused('not_available', failure.code);
    case 'gate_unavailable':
    case 'unavailable':
      return { status: 'failed', errorCode: failure.kind, aiCallIds };
    case 'error':
      return { status: 'failed', errorCode: failure.error.code, aiCallIds };
  }
}
