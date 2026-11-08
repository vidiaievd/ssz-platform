import { Inject, Logger, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { AiFeedback } from '@ssz/contracts';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  MEDIA_ASSETS,
  type IMediaAssets,
} from '../../../../../shared/application/ports/media-assets.port.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import { isTheirs } from '../../../../attempts/application/services/read-aloud-recordings.js';
import { RecordSoundTakeCommand } from './record-sound-take.command.js';
import { SoundSessionLoader, type LoadedSession, type LoadSessionError } from '../../session-loader.js';
import {
  RECORDING_DISCARDER,
  SOUND_TAKE_JUDGE,
  type IRecordingDiscarder,
  type ISoundTakeJudge,
  type TonemeVerdictKind,
} from '../../ports/sound-session.ports.js';
import { readSoundTake, readTonemeTake, type TakeReading } from '../../take-verdict.js';
import {
  currentStep,
  nextState,
  stopSession,
  takeIndex,
  type CurrentStep,
  type SessionState,
  type StepEvent,
} from '../../../domain/session-step.js';
import { sentenceOf, sessionView, type SoundSessionView } from '../../session-view.js';

export type RecordSoundTakeError =
  | LoadSessionError
  /** The session no longer moves: handed in, abandoned, done, or its probe expired. */
  | { code: 'SESSION_CLOSED' }
  /** The take was recorded for a step the session has left — a second send, or a second tab. */
  | { code: 'STALE_TAKE'; takeIndex: number }
  /** No such recording — or not this learner's, or not made for this session. */
  | { code: 'RECORDING_NOT_FOUND' }
  /** media-service refused the file on ingest. */
  | { code: 'RECORDING_FAILED' }
  | { code: 'MEDIA_UNAVAILABLE' };

/** The verdict as the learner is shown it: no thresholds, no scores of other sounds. */
export interface TakeVerdictView {
  measured: boolean;
  /** Null when not measured. */
  passed: boolean | null;
  /** The kind of miss (`KJ:major`, `TONE:1`); null when passed or not measured. */
  key: string | null;
}

export interface RecordSoundTakeResult {
  /**
   * - `judged` — the take counted (measured or not) and the session moved;
   * - `stopped` — the payer may not go on (`pool_empty`, `not_available`): the session is done
   *   with what it measured, and is to be handed in;
   * - `retry` — nothing judged, nothing spent: the same step again (`reason` says why).
   */
  outcome: 'judged' | 'stopped' | 'retry';
  reason: string | null;
  verdict: TakeVerdictView | null;
  /** The remarks of a sounds take (`AiFeedback`, passage 0 is the sentence); null for a toneme take. */
  feedback: AiFeedback | null;
  /** A toneme take: the reference's toneme, the verdict, and both melodies to draw. */
  toneme: {
    tone: 1 | 2;
    verdict: TonemeVerdictKind;
    melody: { stepMs: number; learner: Array<number | null>; reference: Array<number | null> };
  } | null;
  events: StepEvent[];
  session: SoundSessionView;
}

interface Judged {
  reading: TakeReading;
  feedback: AiFeedback | null;
  toneme: RecordSoundTakeResult['toneme'];
}

/**
 * One take of a pronunciation session (plan 86, step 13.4d): the learner's recording of the step
 * in front of them, heard by ai-service, and the session moved by `nextState`.
 *
 * The recording is checked before its id goes anywhere — this learner's, made for this attempt,
 * uploaded — as a hand-in is. The take is judged as the step says: a word in its frame or a course
 * line by its sound (`sentence-checks` with a target, step 13.3), a toneme against its reference
 * (`toneme-checks`). What ai-service answers is read by `take-verdict.ts`: a take that counts, a
 * session that must stop, or nothing done.
 *
 * A take that was heard is deleted at once: a session keeps its verdicts, not the voice. A take
 * that was not (`retry`) is left for the learner to send again — «still uploading» is a retry.
 *
 * `takeIndex` guards a take against a step the session has left: the same recording sent twice
 * would otherwise be judged — and paid — twice, and count as two takes.
 */
@CommandHandler(RecordSoundTakeCommand)
export class RecordSoundTakeHandler implements ICommandHandler<RecordSoundTakeCommand> {
  private readonly logger = new Logger(RecordSoundTakeHandler.name);

  constructor(
    private readonly sessions: SoundSessionLoader,
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(SOUND_TAKE_JUDGE) private readonly judge: ISoundTakeJudge,
    @Inject(RECORDING_DISCARDER) private readonly discarder: IRecordingDiscarder,
    @Optional() @Inject(MEDIA_ASSETS) private readonly media: IMediaAssets | null = null,
  ) {}

  async execute(command: RecordSoundTakeCommand): Promise<Result<RecordSoundTakeResult, RecordSoundTakeError>> {
    const loaded = await this.sessions.load(command.attemptId, command.userId);
    if (loaded.isFail) return Result.fail(loaded.error);
    const session = loaded.value;
    const { attempt, probe, plan, state } = session;

    if (attempt.status !== 'IN_PROGRESS' || state.phase === 'done' || probe.isExpired()) {
      return Result.fail({ code: 'SESSION_CLOSED' });
    }
    if (command.takeIndex !== takeIndex(state)) {
      return Result.fail({ code: 'STALE_TAKE', takeIndex: takeIndex(state) });
    }
    const step = currentStep(plan, state);
    if (!step) return Result.fail({ code: 'SESSION_CLOSED' });

    if (this.media === null) return Result.fail({ code: 'MEDIA_UNAVAILABLE' });
    const described = await this.media.describe([command.recordingAssetId]);
    if (described.isFail) return Result.fail({ code: 'MEDIA_UNAVAILABLE' });
    const take = described.value.find((a) => a.id === command.recordingAssetId);
    if (!take || !isTheirs(take, attempt)) return Result.fail({ code: 'RECORDING_NOT_FOUND' });
    if (take.status === 'FAILED') return Result.fail({ code: 'RECORDING_FAILED' });
    if (take.status === 'PENDING_UPLOAD' || take.durationMs === null) {
      return Result.ok(this.answer(session, state, { reading: { kind: 'retry', reason: 'recording_not_ready' }, feedback: null, toneme: null }, []));
    }

    const judged = await this.judgeTake(session, step, command);

    let moved: { state: SessionState; events: StepEvent[] } | null = null;
    if (judged.reading.kind === 'verdict') moved = nextState(plan, state, judged.reading.verdict);
    if (judged.reading.kind === 'stop') moved = stopSession(state, judged.reading.reason);

    if (moved) {
      const recorded = attempt.recordSessionState(moved.state);
      if (recorded.isFail) return Result.fail({ code: 'SESSION_CLOSED' });
      await this.attempts.save(attempt);
      // Heard: the voice is of no further use. A failure is logged and left to the orphan
      // sweep (plan 71) — the verdict already stands.
      const discarded = await this.discarder.discard(command.recordingAssetId, attempt.userId);
      if (!discarded) this.logger.warn(`Take ${command.recordingAssetId} of session ${attempt.id} was not deleted`);
    }

    return Result.ok(this.answer(session, moved?.state ?? state, judged, moved?.events ?? []));
  }

  private async judgeTake(session: LoadedSession, step: CurrentStep, command: RecordSoundTakeCommand): Promise<Judged> {
    const { attempt, plan } = session;
    const payer = { schoolId: attempt.schoolId, userId: attempt.userId };
    if (step.judge === 'toneme') {
      const word = step.phase === 'diagnostic' ? step.word : step.say;
      if (!word) return { reading: { kind: 'retry', reason: 'nothing_to_say' }, feedback: null, toneme: null };
      const asked = await this.judge.toneme({
        ...payer,
        language: plan.language,
        word: word.word,
        recordingAssetId: command.recordingAssetId,
        referenceAssetId: word.assetId,
      });
      if (asked.isFail) return { reading: { kind: 'retry', reason: 'ai_unavailable' }, feedback: null, toneme: null };
      const outcome = asked.value;
      return {
        reading: readTonemeTake(outcome),
        feedback: null,
        toneme:
          outcome.status === 'ok'
            ? { tone: outcome.comparison.tone, verdict: outcome.comparison.verdict, melody: outcome.melody }
            : null,
      };
    }

    const asked = await this.judge.sounds({
      ...payer,
      exerciseId: attempt.exerciseId,
      language: plan.language,
      explanationLanguage: command.explanationLanguage,
      sentence: sentenceOf(plan.language, step),
      recordingAssetId: command.recordingAssetId,
      target:
        step.phase === 'diagnostic'
          ? { atomId: step.atomId, words: [step.word.word], context: 'word', explained: [] }
          : { atomId: step.atomId, words: step.targetWords, context: step.context, explained: step.explained },
    });
    if (asked.isFail) return { reading: { kind: 'retry', reason: 'ai_unavailable' }, feedback: null, toneme: null };
    const outcome = asked.value;
    return {
      reading: readSoundTake(outcome),
      feedback: outcome.status === 'ok' ? outcome.feedback : null,
      toneme: null,
    };
  }

  private answer(session: LoadedSession, state: SessionState, judged: Judged, events: StepEvent[]): RecordSoundTakeResult {
    const { reading } = judged;
    const verdict: TakeVerdictView | null =
      reading.kind !== 'verdict'
        ? null
        : reading.verdict.measured
          ? { measured: true, passed: reading.verdict.passed, key: reading.verdict.key }
          : { measured: false, passed: null, key: null };
    return {
      outcome: reading.kind === 'verdict' ? 'judged' : reading.kind === 'stop' ? 'stopped' : 'retry',
      reason: reading.kind === 'verdict' ? null : reading.reason,
      verdict,
      feedback: judged.feedback,
      toneme: judged.toneme,
      events,
      session: sessionView({ ...session, state }, false),
    };
  }
}
