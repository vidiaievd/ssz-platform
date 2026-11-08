import { Inject, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { randomInt } from 'node:crypto';
import { Result } from '../../../../../shared/kernel/result.js';
import { StartSoundSessionCommand } from './start-sound-session.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import type { Attempt } from '../../../../attempts/domain/entities/attempt.entity.js';
import { StartAttemptCommand } from '../../../../attempts/application/commands/start-attempt/start-attempt.command.js';
import type {
  StartAttemptError,
  StartAttemptResult,
} from '../../../../attempts/application/commands/start-attempt/start-attempt.handler.js';
import { AbandonAttemptCommand } from '../../../../attempts/application/commands/abandon-attempt/abandon-attempt.command.js';
import {
  PROBE_TASK_REPOSITORY,
  type IProbeTaskRepository,
} from '../../../../probes/domain/repositories/probe-task.repository.js';
import type { ProbeTask } from '../../../../probes/domain/entities/probe-task.entity.js';
import { CreateProbeCommand } from '../../../../probes/application/commands/create-probe/create-probe.command.js';
import type { CreateProbeError } from '../../../../probes/application/commands/create-probe/create-probe.handler.js';
import {
  LEARNER_SOUNDS_READER,
  SOUND_DRILL_READER,
  type ILearnerSoundsReader,
  type ISoundDrillReader,
  type SoundSessionSourceError,
} from '../../ports/sound-session.ports.js';
import { planSession, type Rand, type SessionPlan } from '../../../domain/session-plan.js';
import { startState, type SessionState } from '../../../domain/session-step.js';
import {
  readPlan,
  readState,
  TEMPLATE_CODE as SOUND_SESSION,
  toContent,
} from '../../../domain/sound-session-template.js';
import { sessionView, type SoundSessionView } from '../../session-view.js';

export type StartSoundSessionError =
  /** learning-service or content-service did not answer usably: the plan cannot be made. */
  | { code: 'SOURCE_UNAVAILABLE'; source: SoundSessionSourceError['source']; statusCode: number }
  /** The chosen sound is not a drillable sound of the language. */
  | { code: 'SOUND_NOT_DRILLABLE'; atomId: string }
  /** Nothing in the language has a word with a reference clip. */
  | { code: 'NO_MATERIAL'; language: string }
  /** The probe or its attempt could not be made — a bug or a store failure, never the learner's. */
  | { code: 'START_FAILED'; detail: string };

/** The platform CSPRNG, as a `minimal_pairs` draw: the order is the key's neighbour. */
const cspRand: Rand = () => randomInt(0, 2 ** 32) / 2 ** 32;

/**
 * A pronunciation session, begun or resumed (plan 86, step 13.4c, Q27 A).
 *
 * One open session per learner. An open one is handed back as it stands when it can go on — its
 * probe alive, the same language, and, when the learner chose a sound, that sound — and is
 * abandoned otherwise: a session nobody can finish only blocks the next.
 *
 * A new session reads the learner's record and the drill material, makes the plan (`planSession`,
 * Q31), stores it as the content of a probe on the engine's own template `sound_session`, starts an
 * ordinary attempt on that probe and writes the session's first state on it. Learning or content
 * away is a refusal, not «no record»: a learner with cards must not be sent into a diagnostic
 * because a service was slow.
 */
@CommandHandler(StartSoundSessionCommand)
export class StartSoundSessionHandler implements ICommandHandler<StartSoundSessionCommand> {
  private readonly logger = new Logger(StartSoundSessionHandler.name);

  constructor(
    private readonly commandBus: CommandBus,
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(PROBE_TASK_REPOSITORY) private readonly probes: IProbeTaskRepository,
    @Inject(LEARNER_SOUNDS_READER) private readonly learner: ILearnerSoundsReader,
    @Inject(SOUND_DRILL_READER) private readonly drill: ISoundDrillReader,
  ) {}

  /** The random source of the plan; replaced in tests. */
  rand: Rand = cspRand;

  async execute(command: StartSoundSessionCommand): Promise<Result<SoundSessionView, StartSoundSessionError>> {
    const language = command.language.toLowerCase();

    const { resumed, stale } = await this.openSessions(command, language);
    if (resumed) {
      await this.abandon(stale, command.userId);
      return Result.ok(sessionView(resumed, true));
    }

    const [record, material] = await Promise.all([
      this.learner.read(command.userId, language),
      this.drill.read(language, []),
    ]);
    if (record.isFail) return Result.fail(unavailable(record.error));
    if (material.isFail) return Result.fail(unavailable(material.error));

    const plan = planSession({
      material: material.value,
      learner: record.value,
      chosen: command.atomId,
      rand: this.rand,
    });
    if (plan === 'sound_not_drillable') return Result.fail({ code: 'SOUND_NOT_DRILLABLE', atomId: command.atomId ?? '' });
    if (plan === 'no_material') return Result.fail({ code: 'NO_MATERIAL', language });

    // Only now: a request that is refused (a sound that cannot be drilled, a service away)
    // must not cost the learner the session they have open.
    await this.abandon(stale, command.userId);

    const probe = await this.createProbe(command.userId, plan);
    if (probe.isFail) return Result.fail(probe.error);

    const started = await this.commandBus.execute<StartAttemptCommand, Result<StartAttemptResult, StartAttemptError>>(
      new StartAttemptCommand(command.userId, probe.value.id, 'en', null, null, 'PRACTICE'),
    );
    if (started.isFail) {
      return Result.fail({ code: 'START_FAILED', detail: describe(started.error) });
    }

    const attempt = await this.attempts.findById(started.value.attemptId);
    if (!attempt) return Result.fail({ code: 'START_FAILED', detail: 'the attempt vanished after its start' });
    const state = startState(plan);
    const recorded = attempt.recordSessionState(state);
    if (recorded.isFail) return Result.fail({ code: 'START_FAILED', detail: recorded.error.message });
    await this.attempts.save(attempt);

    return Result.ok(sessionView({ attempt, probe: probe.value, plan, state }, false));
  }

  /**
   * The open session to hand back, if any, and the others — to be abandoned once the request is
   * known to succeed. Newest first: two open sessions mean an earlier start was cut off, and the
   * newer one is the one the learner last saw.
   */
  private async openSessions(
    command: StartSoundSessionCommand,
    language: string,
  ): Promise<{
    resumed: { attempt: Attempt; probe: ProbeTask; plan: SessionPlan; state: SessionState } | null;
    stale: Attempt[];
  }> {
    const open = await this.attempts.findInProgressByTemplate(command.userId, SOUND_SESSION);
    let resumed: { attempt: Attempt; probe: ProbeTask; plan: SessionPlan; state: SessionState } | null = null;
    const stale: Attempt[] = [];

    for (const attempt of open) {
      if (resumed === null) {
        const probe = await this.probes.findById(attempt.exerciseId);
        const plan = probe ? readPlan(probe.definition.content) : null;
        const state = readState(attempt.sessionState);
        const fits =
          probe !== null &&
          !probe.isExpired() &&
          probe.userId === command.userId &&
          plan !== null &&
          state !== null &&
          state.phase !== 'done' &&
          plan.language === language &&
          (command.atomId === null || (plan.basis === 'chosen' && plan.sounds[0]?.atomId === command.atomId));
        if (fits) {
          resumed = { attempt, probe: probe!, plan: plan!, state: state! };
          continue;
        }
      }
      stale.push(attempt);
    }
    return { resumed, stale };
  }

  /** A session nobody can finish only blocks the next one; failing to abandon it is logged, not fatal. */
  private async abandon(stale: readonly Attempt[], userId: string): Promise<void> {
    for (const attempt of stale) {
      const abandoned = await this.commandBus.execute<AbandonAttemptCommand, Result<void, unknown>>(
        new AbandonAttemptCommand(attempt.id, userId),
      );
      if (abandoned.isFail) {
        this.logger.warn(`Open sound session ${attempt.id} could not be abandoned: ${describe(abandoned.error)}`);
      }
    }
  }

  private async createProbe(userId: string, plan: SessionPlan): Promise<Result<ProbeTask, StartSoundSessionError>> {
    const subject = plan.sounds[0]?.atomId ?? plan.diagnostic[0]?.atomId ?? plan.candidates[0]?.atomId;
    if (!subject) return Result.fail({ code: 'START_FAILED', detail: 'a plan with no sound at all' });

    const created = await this.commandBus.execute<CreateProbeCommand, Result<ProbeTask, CreateProbeError>>(
      new CreateProbeCommand(
        userId,
        { atomType: 'sound', atomId: subject },
        'production',
        {
          templateCode: SOUND_SESSION,
          targetLanguage: plan.language,
          // Nothing in a session is levelled; A1 is the course's floor, and no reader keys on it.
          difficultyLevel: 'A1',
          content: toContent(plan),
          expectedAnswers: null,
          answerCheckSettings: null,
          instruction: null,
        },
        ['spoken'],
        ['pronunciation'],
        /*
          The subject as context, explicitly, so the probe adds no `focus` target of its own.
          A session rates each sound by its gaps (step 13.5), never by the attempt's score —
          and step 13.5 must keep exercise-level targets out of the event, because learning
          rates those by the score whatever their role.
        */
        [{ itemKey: null, atomType: 'sound', atomId: subject, role: 'context' }],
        null,
        'generated',
        null,
      ),
    );
    if (created.isFail) return Result.fail({ code: 'START_FAILED', detail: created.error.message });
    return Result.ok(created.value);
  }
}

function unavailable(error: SoundSessionSourceError): StartSoundSessionError {
  return { code: 'SOURCE_UNAVAILABLE', source: error.source, statusCode: error.statusCode };
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'code' in error) return String((error as { code: unknown }).code);
  return String(error);
}
