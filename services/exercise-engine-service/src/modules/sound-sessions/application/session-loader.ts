import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../attempts/domain/repositories/attempt.repository.js';
import type { Attempt } from '../../attempts/domain/entities/attempt.entity.js';
import {
  PROBE_TASK_REPOSITORY,
  type IProbeTaskRepository,
} from '../../probes/domain/repositories/probe-task.repository.js';
import type { ProbeTask } from '../../probes/domain/entities/probe-task.entity.js';
import type { SessionPlan } from '../domain/session-plan.js';
import type { SessionState } from '../domain/session-step.js';
import { readPlan, readState, TEMPLATE_CODE as SOUND_SESSION } from '../domain/sound-session-template.js';

export interface LoadedSession {
  attempt: Attempt;
  probe: ProbeTask;
  plan: SessionPlan;
  state: SessionState;
}

export type LoadSessionError =
  /** No such attempt — or not this learner's: the two look the same from outside. */
  | { code: 'SESSION_NOT_FOUND' }
  /** The attempt is not a pronunciation session. */
  | { code: 'NOT_A_SESSION' }
  /** The probe or the stored state is unreadable — a writer's bug, never the learner's. */
  | { code: 'SESSION_BROKEN'; detail: string };

/**
 * A learner's pronunciation session by its attempt (plan 86, step 13.4d): the attempt, its probe,
 * the plan the probe holds and the state the attempt holds. Whether it may still move — open,
 * not expired, not done — is each caller's question: reading the step of a finished session is
 * fine, recording into it is not.
 */
@Injectable()
export class SoundSessionLoader {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(PROBE_TASK_REPOSITORY) private readonly probes: IProbeTaskRepository,
  ) {}

  async load(attemptId: string, userId: string): Promise<Result<LoadedSession, LoadSessionError>> {
    const attempt = await this.attempts.findById(attemptId);
    if (!attempt || attempt.userId !== userId) return Result.fail({ code: 'SESSION_NOT_FOUND' });
    if (attempt.templateCode !== SOUND_SESSION) return Result.fail({ code: 'NOT_A_SESSION' });

    const probe = await this.probes.findById(attempt.exerciseId);
    if (!probe) return Result.fail({ code: 'SESSION_BROKEN', detail: 'the probe of the session is gone' });
    const plan = readPlan(probe.definition.content);
    if (!plan) return Result.fail({ code: 'SESSION_BROKEN', detail: 'the probe holds no plan' });
    const state = readState(attempt.sessionState);
    if (!state) return Result.fail({ code: 'SESSION_BROKEN', detail: 'the attempt holds no session state' });

    return Result.ok({ attempt, probe, plan, state });
  }
}
