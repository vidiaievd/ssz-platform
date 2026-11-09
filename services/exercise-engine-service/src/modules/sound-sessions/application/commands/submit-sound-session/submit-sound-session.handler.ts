import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import { atomsFlagged, publishAtomsFlagged } from '../../../../attempts/application/services/flagged-atoms.js';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import { SubmitAnswerCommand } from '../../../../attempts/application/commands/submit-answer/submit-answer.command.js';
import type {
  SubmitAnswerError,
  SubmitAnswerResult,
} from '../../../../attempts/application/commands/submit-answer/submit-answer.handler.js';
import { SubmitSoundSessionCommand } from './submit-sound-session.command.js';
import { SoundSessionLoader, type LoadSessionError } from '../../session-loader.js';
import {
  diagnosticWeak,
  sessionFlags,
  soundOutcomes,
  stopSession,
  type DoneReason,
  type SoundOutcome,
} from '../../../domain/session-step.js';
import { sessionView, type SoundSessionView } from '../../session-view.js';

export type SubmitSoundSessionError =
  | LoadSessionError
  /** Already handed in or abandoned. */
  | { code: 'SESSION_CLOSED' }
  /** The ordinary hand-in refused: an expired probe (404), a store failure. */
  | { code: 'SUBMIT_FAILED'; detail: string };

export interface SubmitSoundSessionResult {
  attemptId: string;
  /** Share of the session's sounds passed, 0–100; 100 when the diagnostic found nothing weak. */
  score: number | null;
  doneReason: DoneReason | null;
  /** Each sound of the session and what the session says about its card (Q28). */
  sounds: SoundOutcome[];
  /** Families the diagnostic heard as weak — flagged, never rated. */
  diagnosticWeak: string[];
  /** Sounds flagged `ai_session` on the hand-in: weak, not rated by this session (step 13.5b). */
  flagged: string[];
  session: SoundSessionView;
}

/**
 * A pronunciation session handed in (plan 86, step 13.4d): stopped where it stands unless it is
 * already done, then summed up by the ordinary submit — the attempt is scored by
 * `SoundSessionValidator` and its event published like any other probe's. The submission is the
 * state the engine recorded, never anything from the learner (the submit handler writes it over
 * the body). Each rated sound rides on `attempt.completed` as a gap (step 13.5a); the weak sounds
 * it did not rate — the diagnostic's and those heard on the way — go out after the hand-in as one
 * `atoms_flagged` letter with the source `ai_session` (step 13.5b), published directly like the
 * rehearsal's: a lost letter costs one nudge of a due date, never the hand-in.
 */
@CommandHandler(SubmitSoundSessionCommand)
export class SubmitSoundSessionHandler implements ICommandHandler<SubmitSoundSessionCommand> {
  private readonly logger = new Logger(SubmitSoundSessionHandler.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly sessions: SoundSessionLoader,
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(command: SubmitSoundSessionCommand): Promise<Result<SubmitSoundSessionResult, SubmitSoundSessionError>> {
    const loaded = await this.sessions.load(command.attemptId, command.userId);
    if (loaded.isFail) return Result.fail(loaded.error);
    const { attempt } = loaded.value;
    if (attempt.status !== 'IN_PROGRESS') return Result.fail({ code: 'SESSION_CLOSED' });

    let state = loaded.value.state;
    if (state.phase !== 'done') {
      state = stopSession(state, 'stopped').state;
      const recorded = attempt.recordSessionState(state);
      if (recorded.isFail) return Result.fail({ code: 'SESSION_CLOSED' });
      await this.attempts.save(attempt);
    }

    const submitted = await this.commandBus.execute<SubmitAnswerCommand, Result<SubmitAnswerResult, SubmitAnswerError>>(
      new SubmitAnswerCommand(attempt.id, command.userId, { state }, 0, command.locale),
    );
    if (submitted.isFail) return Result.fail({ code: 'SUBMIT_FAILED', detail: describe(submitted.error) });

    const flagged = sessionFlags(state);
    await publishAtomsFlagged(
      this.publisher,
      this.logger,
      atomsFlagged(attempt, 'ai_session', flagged.map((atomId) => ({ atomType: 'sound', atomId })), new Date()),
    );

    return Result.ok({
      attemptId: attempt.id,
      score: submitted.value.score,
      doneReason: state.doneReason,
      sounds: soundOutcomes(state),
      diagnosticWeak: diagnosticWeak(state),
      flagged,
      session: { ...sessionView({ ...loaded.value, state }, false), step: null },
    });
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'code' in error) return String((error as { code: unknown }).code);
  return String(error);
}
