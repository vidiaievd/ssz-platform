import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
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
  session: SoundSessionView;
}

/**
 * A pronunciation session handed in (plan 86, step 13.4d): stopped where it stands unless it is
 * already done, then summed up by the ordinary submit — the attempt is scored by
 * `SoundSessionValidator` and its event published like any other probe's. The submission is the
 * state the engine recorded, never anything from the learner (the submit handler writes it over
 * the body). What the event carries per sound is step 13.5.
 */
@CommandHandler(SubmitSoundSessionCommand)
export class SubmitSoundSessionHandler implements ICommandHandler<SubmitSoundSessionCommand> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly sessions: SoundSessionLoader,
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
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

    return Result.ok({
      attemptId: attempt.id,
      score: submitted.value.score,
      doneReason: state.doneReason,
      sounds: soundOutcomes(state),
      diagnosticWeak: diagnosticWeak(state),
      session: { ...sessionView({ ...loaded.value, state }, false), step: null },
    });
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'code' in error) return String((error as { code: unknown }).code);
  return String(error);
}
