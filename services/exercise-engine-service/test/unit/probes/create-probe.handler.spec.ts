import { jest } from '@jest/globals';
import { CreateProbeHandler } from '../../../src/modules/probes/application/commands/create-probe/create-probe.handler.js';
import { CreateProbeCommand } from '../../../src/modules/probes/application/commands/create-probe/create-probe.command.js';
import { ProbeTemplateNotScorableError } from '../../../src/modules/probes/domain/exceptions/probe.errors.js';
import type { ProbeTask } from '../../../src/modules/probes/domain/entities/probe-task.entity.js';
import type { IProbeTaskRepository } from '../../../src/modules/probes/domain/repositories/probe-task.repository.js';
import type { ProbeSweeper } from '../../../src/modules/probes/application/services/probe-sweeper.service.js';
import type { IAnswerValidator } from '../../../src/shared/application/ports/answer-validator.port.js';

// Plan 63 phase 9.

const PROBE_CONFIG = { defaultTtlSeconds: 21_600, maxTtlSeconds: 604_800, sweepBatch: 500 };

function makeHandler(options: { supports?: boolean; sweep?: () => Promise<number> } = {}) {
  const saved: ProbeTask[] = [];
  const repo = {
    save: jest.fn(async (probe: ProbeTask) => {
      saved.push(probe);
    }),
  } as unknown as IProbeTaskRepository;

  const validator = {
    supports: () => options.supports ?? true,
  } as unknown as IAnswerValidator;

  const sweeper = {
    sweep: options.sweep ?? (async () => 0),
  } as unknown as ProbeSweeper;

  const config = { get: () => PROBE_CONFIG } as never;

  return { handler: new CreateProbeHandler(repo, validator, sweeper, config), saved };
}

function command(overrides: Partial<CreateProbeCommand> = {}) {
  return new CreateProbeCommand(
    'learner-1',
    { atomType: 'grammar_rule_atom', atomId: 'passive-choice' },
    'production',
    {
      templateCode: overrides.definition?.templateCode ?? 'fill_in_blank',
      targetLanguage: 'no',
      difficultyLevel: 'B1',
      content: {},
      expectedAnswers: null,
      answerCheckSettings: null,
      instruction: null,
    },
    [],
    [],
    null,
    overrides.ttlSeconds ?? null,
    'manual',
    'learner-1',
  );
}

describe('CreateProbeHandler', () => {
  it('refuses a template the engine cannot score', async () => {
    // The failure belongs to whoever assembled the task, at the moment they assembled it.
    // A probe on an unscorable template produces no evidence, and the learner should never
    // be the one to find that out — they would work through it and meet an error on submit.
    const { handler, saved } = makeHandler({ supports: false });

    const result = await handler.execute(command());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ProbeTemplateNotScorableError);
    expect(saved).toHaveLength(0);
  });

  it('clamps a TTL above the ceiling instead of refusing it', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(command({ ttlSeconds: 99_999_999 } as never));

    const lifetimeSeconds =
      (result.value.expiresAt.getTime() - result.value.createdAt.getTime()) / 1000;
    expect(lifetimeSeconds).toBe(PROBE_CONFIG.maxTtlSeconds);
  });

  it('falls back to the configured default when no TTL is asked for', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(command());

    const lifetimeSeconds =
      (result.value.expiresAt.getTime() - result.value.createdAt.getTime()) / 1000;
    expect(lifetimeSeconds).toBe(PROBE_CONFIG.defaultTtlSeconds);
  });

  it('still hands back the probe when the sweep it triggers fails', async () => {
    // The caller asked for a task and got one. A sweep that could not run is this
    // service's business, not theirs — and the sweep is housekeeping, not part of the
    // promise being made here.
    const { handler, saved } = makeHandler({
      sweep: () => Promise.reject(new Error('database is having a moment')),
    });

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    expect(saved).toHaveLength(1);
  });
});
