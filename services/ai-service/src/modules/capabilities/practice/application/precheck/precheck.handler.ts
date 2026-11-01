import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Logger, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { AiFeedback } from '@ssz/contracts';
import { AiGateway, type GatewayCallOf, type GatewayFailureOf } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import type { EngineSubject } from '../../../review-draft/application/ports/review-attempts.client.js';
import {
  SCHOOL_LANGUAGE_READER,
  type ISchoolLanguageReader,
} from '../../../review-draft/application/ports/school-language.reader.js';
import { SchoolPayerResolver } from '../../../review-draft/application/school-payer.resolver.js';
import { RECORDING_AUDIO_SOURCE, type IRecordingAudioSource } from '../../../voice-review/application/ports/recording-audio.source.js';
import { audible, recordingLevel } from '../../../../providers/domain/recording-level.js';
import type { ReadAloudSubject } from '../../../voice-review/domain/read-aloud-subject.js';
import { AtomCatalogResolver } from '../../../grammar-atoms/application/atom-catalog.resolver.js';
import { EMPTY_CATALOG, GRAMMAR_ASPECTS } from '../../../grammar-atoms/domain/atom-catalog.js';
import { toAiFeedback } from '../../domain/practice-feedback.js';
import { toVoiceFeedback, type PassageHearing } from '../../domain/voice-feedback.js';
import { PRACTICE, PRACTICE_VOICE } from '../../practice.capability.js';
import { practiceRequest } from '../../prompts/prompts.js';
import { PRACTICE_USAGE_READER, type IPracticeUsageReader, type PracticeUsage } from '../ports/practice-usage.reader.js';
import { practiceUnaskable, toPracticeSubject } from '../practice-subject.js';
import {
  calendarMonthOf,
  limitReached,
  PRECHECK_SURFACE,
  remainingAfter,
  type LimitRefusal,
  type PrecheckRemaining,
} from './precheck-limits.js';
import { PrecheckCommand, type PracticeSubject, type PrecheckRequest } from './precheck.command.js';

export { PRECHECK_SURFACE };

/**
 * Pauses between asks for takes media is still converting. The learner is waiting on this
 * call, so far shorter than the queue's: a take just uploaded is seconds behind. A token for tests.
 */
export const PRECHECK_RECORDING_WAITS_MS = Symbol('PRECHECK_RECORDING_WAITS_MS');
const DEFAULT_RECORDING_WAITS_MS = [1_000, 2_000];

/**
 * Why no check was made, on purpose:
 * - `unaskable` — nothing to ask about (`detail`: AI off for the exercise, no aspect, empty answer);
 * - `exercise_limit` — the learner has used the school's checks of this exercise;
 * - `learner_limit` — the learner's monthly credits at this school are spent;
 * - `pool_empty` — the school's `ai.practice` credits for the period are spent;
 * - `not_available` — the agent is switched off, or the school may not use it (policy, tariff);
 * - `template_not_supported` — not a template a rehearsal reads.
 *
 * A failure's `errorCode` is the provider's, `gate_unavailable` / `unavailable`, or for a reading
 * `recording_missing` / `recording_not_ready` / `recording_unreadable` / `recording_inaudible`
 * (no call made).
 */
export type PrecheckRefusal = 'unaskable' | LimitRefusal | 'pool_empty' | 'not_available' | 'template_not_supported';

/**
 * `remaining` is what the school's limits leave after this request; null when they were not
 * read — the request stopped before them, or the ledger could not be read.
 */
export type PrecheckOutcome =
  | { status: 'ok'; feedback: AiFeedback; aiCallIds: string[]; remaining: PrecheckRemaining | null }
  | { status: 'refused'; reason: PrecheckRefusal; detail: string | null; remaining: PrecheckRemaining | null }
  /** A model was wanted and none answered usably; the call ids, for the log. */
  | { status: 'failed'; errorCode: string; aiCallIds: string[]; remaining: PrecheckRemaining | null };

/** An outcome before what is left is known. */
type WithoutRemaining<O> = O extends unknown ? Omit<O, 'remaining'> : never;

/** How a check ran. */
interface Ran {
  outcome: WithoutRemaining<PrecheckOutcome>;
  /** A model answered one of its calls: one check more. */
  counted: boolean;
  /** What each call was billed. */
  credits: Array<string | null>;
}

/**
 * A rehearsal before hand-in (plan 84, steps 2–3): work in progress, sent by exercise-engine,
 * → the school's limits → the gateway under the school's `ai.practice` (surface `precheck`)
 * → hints in the `AiFeedback` shape, straight back to the caller. Nothing is written anywhere
 * but the ledger: the attempt stays in progress, no event, no verdict — the hand-in is the
 * only thing that counts (§3, rule 1).
 *
 * A reading aloud (step 2c) goes to `practice_voice` instead: every take's speech WAV from
 * media, one call per passage, the words heard back as they are. Every take is fetched before
 * the first call, so a reading missing one costs nothing.
 *
 * Limits (step 3, plan §2 Q2): checks per (learner, exercise) and credits per learner per
 * calendar month, as the engine read them from the school, counted from the ledger — every
 * call of one check carries its id and the exercise. The third level is the gate's pool.
 * Checked before the call, counted after it: requests in flight together can overshoot a limit
 * by one check, as the gate's quota can. A ledger that cannot be read lets the check through
 * uncounted — the pool still holds.
 *
 * Whether the school lets its learners rehearse at all is the engine's to read; the gate here
 * still checks the school's tariff and policy.
 */
@CommandHandler(PrecheckCommand)
export class PrecheckHandler implements ICommandHandler<PrecheckCommand, PrecheckOutcome> {
  private readonly logger = new Logger(PrecheckHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    private readonly schoolPayers: SchoolPayerResolver,
    @Inject(SCHOOL_LANGUAGE_READER) private readonly schools: ISchoolLanguageReader,
    @Inject(RECORDING_AUDIO_SOURCE) private readonly recordings: IRecordingAudioSource,
    @Inject(PRACTICE_USAGE_READER) private readonly usageReader: IPracticeUsageReader,
    private readonly atomCatalogs: AtomCatalogResolver,
    @Optional() @Inject(PRECHECK_RECORDING_WAITS_MS) private readonly recordingWaitsMs: number[] = DEFAULT_RECORDING_WAITS_MS,
  ) {}

  async execute({ request }: PrecheckCommand): Promise<PrecheckOutcome> {
    const { subject } = request;
    if (subject.template === 'read_aloud') {
      // `read` mode with the transcript check and a passage on every prompt — else nothing to hear against.
      if (!subject.ai.on || subject.prompts.length === 0) return refused('unaskable', 'machine_cannot_check');
    } else if (!isTextSubject(subject)) {
      return refused('template_not_supported', String((subject as { template?: unknown }).template));
    } else {
      const unasked = practiceUnaskable(subject);
      if (unasked) return refused('unaskable', unasked);
    }

    const usage = await this.usageOf(request);
    const reached = usage && limitReached(request.limits, usage);
    if (reached) return { ...refused(reached, null), remaining: remainingAfter(request.limits, usage) };

    const context: CallContext = {
      payer: await this.schoolPayers.resolve({ schoolId: request.schoolId }),
      actor: { userId: request.userId, role: 'student' },
      surface: PRECHECK_SURFACE,
      subject: { exerciseId: request.exerciseId, checkId: randomUUID() },
    };
    const ran = subject.template === 'read_aloud' ? await this.hearReading(context, subject) : await this.readText(request, context, subject);
    const remaining = usage ? remainingAfter(request.limits, usage, ran) : null;
    return { ...ran.outcome, remaining } as PrecheckOutcome;
  }

  private async readText(request: PrecheckRequest, context: CallContext, subject: EngineSubject): Promise<Ran> {
    const language = await this.schoolLanguage(request.schoolId);
    const prepared = toPracticeSubject(subject, language);
    // Only worth reading when a grammar aspect is checked: no other remark names an atom.
    const catalog = prepared.input.aspects.some((aspect) => GRAMMAR_ASPECTS.has(aspect))
      ? await this.atomCatalogs.forLearner({ userId: request.userId, courseId: request.courseId, language: language ?? 'en' })
      : EMPTY_CATALOG;
    const call = await this.gateway.call(PRACTICE.code, context, (promptVersion) => practiceRequest(promptVersion, prepared, catalog));
    const callIds = [call.recorded.callId];
    const billed = { counted: call.routed.isOk, credits: [call.recorded.credits] };

    if (call.routed.isFail) return { outcome: notAnswered(call.routed.error, callIds), ...billed };
    const { output } = call.routed.value.result;
    if (output.kind !== 'structured') return { outcome: { status: 'failed', errorCode: 'invalid_response', aiCallIds: callIds }, ...billed };
    return { outcome: { status: 'ok', feedback: toAiFeedback(output.data, prepared.input, catalog), aiCallIds: callIds }, ...billed };
  }

  private async hearReading(context: CallContext, subject: ReadAloudSubject): Promise<Ran> {
    const takes = await this.takes(subject);
    if (takes.kind !== 'ready') {
      return { outcome: { status: 'failed', errorCode: `recording_${takes.kind}`, aiCallIds: [] }, counted: false, credits: [] };
    }

    const hearings: PassageHearing[] = [];
    const calls: GatewayCallOf<unknown>[] = [];
    const billed = () => ({ counted: calls.some((c) => c.routed.isOk), credits: calls.map((c) => c.recorded.credits) });
    for (const [passageIndex, prompt] of subject.prompts.entries()) {
      const call = await this.gateway.callSpeech(PRACTICE_VOICE.code, context, {
        audio: { format: 'wav', data: takes.wavs.get(prompt.itemId)! },
        referenceText: prompt.text,
        language: subject.targetLanguage,
        pronunciation: subject.ai.checks.pronunciation,
      });
      calls.push(call);
      // A passage unheard leaves the reading half-heard: the learner asks again rather than read half.
      if (call.routed.isFail) return { outcome: notAnswered(call.routed.error, calls.map((c) => c.recorded.callId)), ...billed() };
      hearings.push({ passageIndex, heard: call.routed.value.result });
    }
    return {
      outcome: { status: 'ok', feedback: toVoiceFeedback(hearings), aiCallIds: calls.map((c) => c.recorded.callId) },
      ...billed(),
    };
  }

  /** What the learner has used at this school; null when the ledger cannot be read (then uncounted). */
  private async usageOf(request: PrecheckRequest): Promise<PracticeUsage | null> {
    if (request.limits.perExercise === null && request.limits.perLearnerMonthlyCredits === null) return null;
    try {
      return await this.usageReader.usage({
        schoolId: request.schoolId,
        userId: request.userId,
        exerciseId: request.exerciseId,
        ...calendarMonthOf(new Date()),
      });
    } catch (err) {
      this.logger.warn(
        `Rehearsal usage of ${request.userId} at school ${request.schoolId} unreadable; checking uncounted: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return null;
    }
  }

  /** Every take's speech WAV, asking again a little while media is still converting one. */
  private async takes(
    subject: ReadAloudSubject,
  ): Promise<{ kind: 'ready'; wavs: Map<string, Uint8Array> } | { kind: 'missing' | 'not_ready' | 'unreadable' | 'inaudible' }> {
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
      if (!pending) return this.audibleTakes(subject, wavs);
      if (round >= this.recordingWaitsMs.length) return { kind: 'not_ready' };
      await sleep(this.recordingWaitsMs[round]);
    }
  }
  /**
   * The takes, unless one is too quiet or too noisy for a voice to be heard in it (plan 88,
   * step 4): Azure would hear nothing and be paid for it, and the reading would read as not read.
   */
  private audibleTakes(
    subject: ReadAloudSubject,
    wavs: Map<string, Uint8Array>,
  ): { kind: 'ready'; wavs: Map<string, Uint8Array> } | { kind: 'inaudible' } {
    for (const prompt of subject.prompts) {
      const level = recordingLevel(wavs.get(prompt.itemId)!);
      if (!audible(level)) {
        this.logger.warn(
          `Take ${prompt.assetId} inaudible: voice ${level!.speechDb} dBFS, ${level!.contrastDb} dB over its noise`,
        );
        return { kind: 'inaudible' };
      }
    }
    return { kind: 'ready', wavs };
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

function refused(reason: PrecheckRefusal, detail: string | null): Extract<PrecheckOutcome, { status: 'refused' }> {
  return { status: 'refused', reason, detail, remaining: null };
}

/** A call that reached no usable answer: refused on purpose, or failed. */
export function notAnswered<R>(failure: GatewayFailureOf<R>, aiCallIds: string[]): Ran['outcome'] {
  switch (failure.kind) {
    case 'disabled':
      return { status: 'refused', reason: 'not_available', detail: 'disabled' };
    case 'refused':
      return failure.code === 'quota_exhausted'
        ? { status: 'refused', reason: 'pool_empty', detail: null }
        : { status: 'refused', reason: 'not_available', detail: failure.code };
    case 'gate_unavailable':
    case 'unavailable':
      return { status: 'failed', errorCode: failure.kind, aiCallIds };
    case 'error':
      return { status: 'failed', errorCode: failure.error.code, aiCallIds };
  }
}
