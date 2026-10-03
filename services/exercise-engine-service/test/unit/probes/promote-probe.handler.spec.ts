import { jest } from '@jest/globals';
import { PromoteProbeHandler } from '../../../src/modules/probes/application/commands/promote-probe/promote-probe.handler.js';
import { PromoteProbeCommand } from '../../../src/modules/probes/application/commands/promote-probe/promote-probe.command.js';
import { ProbeTask } from '../../../src/modules/probes/domain/entities/probe-task.entity.js';
import {
  ProbeAlreadyPromotedError,
  ProbeNotYoursError,
} from '../../../src/modules/probes/domain/exceptions/probe.errors.js';
import type { IProbeTaskRepository } from '../../../src/modules/probes/domain/repositories/probe-task.repository.js';
import type {
  CreateExerciseInput,
  IContentClient,
} from '../../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 63 phase 9, step 4. Nine generated tasks out of ten are asked once and forgotten;
// the tenth is a better question than the one a person would have written. This is how
// that one gets into the catalogue without the other nine following it in.

function makeProbe(overrides: { userId?: string; createdByUserId?: string | null } = {}) {
  return ProbeTask.create({
    userId: overrides.userId ?? 'learner-1',
    subject: { atomType: 'grammar_rule_atom', atomId: 'passive-choice' },
    requiredModality: 'production',
    definition: {
      templateCode: 'fill_in_blank',
      targetLanguage: 'no',
      difficultyLevel: 'B1',
      content: { text_with_blanks: 'Huset ___1___ malt i fjor.' },
      expectedAnswers: { blanks: [{ blank_id: 1, accepted_answers: ['ble'] }] },
      answerCheckSettings: null,
      instruction: null,
    },
    createdByUserId: overrides.createdByUserId ?? 'tutor-1',
    ttlSeconds: 3600,
  });
}

function makeHandler(probe: ProbeTask | null, createFails?: ContentClientError) {
  const saved: ProbeTask[] = [];
  const probes = {
    findById: jest.fn(async (id: string) => (probe && probe.id === id ? probe : null)),
    save: jest.fn(async (p: ProbeTask) => {
      saved.push(p);
    }),
  } as unknown as IProbeTaskRepository;

  const created: CreateExerciseInput[] = [];
  const content = {
    createExercise: jest.fn(async (input: CreateExerciseInput) => {
      created.push(input);
      return createFails
        ? Result.fail<{ exerciseId: string }, ContentClientError>(createFails)
        : Result.ok<{ exerciseId: string }, ContentClientError>({ exerciseId: 'exercise-9' });
    }),
  } as unknown as IContentClient;

  return { handler: new PromoteProbeHandler(probes, content), created, saved };
}

describe('PromoteProbeHandler', () => {
  it('files the task as an exercise owned by whoever promoted it, addresses and all', async () => {
    // The addresses are the reason to promote rather than retype: the exercise arrives
    // already saying what it is about, which is the state most of the catalogue is not in.
    const probe = makeProbe();
    const { handler, created } = makeHandler(probe);

    const result = await handler.execute(new PromoteProbeCommand(probe.id, 'tutor-1'));

    expect(result.value.exerciseId).toBe('exercise-9');
    expect(created[0]!.ownerUserId).toBe('tutor-1');
    expect(created[0]!.templateCode).toBe('fill_in_blank');
    expect(created[0]!.targets).toEqual([
      { itemKey: null, atomType: 'grammar_rule_atom', atomId: 'passive-choice', role: 'focus' },
    ]);
  });

  it('records which exercise the probe became, without becoming it', async () => {
    const probe = makeProbe();
    const { handler, saved } = makeHandler(probe);

    await handler.execute(new PromoteProbeCommand(probe.id, 'learner-1'));

    expect(saved[0]!.promotedExerciseId).toBe('exercise-9');
    // Still on the same clock it was on: promotion is provenance, not a stay of execution.
    expect(saved[0]!.expiresAt).toEqual(probe.expiresAt);
  });

  it('lets the learner it was dealt to promote it, as well as whoever made it', async () => {
    const probe = makeProbe();
    const { handler } = makeHandler(probe);

    expect((await handler.execute(new PromoteProbeCommand(probe.id, 'learner-1'))).isOk).toBe(true);
  });

  it('reads as "no such probe" for anybody else', async () => {
    const probe = makeProbe();
    const { handler, created } = makeHandler(probe);

    const result = await handler.execute(new PromoteProbeCommand(probe.id, 'stranger'));

    expect(result.error).toBeInstanceOf(ProbeNotYoursError);
    expect(created).toHaveLength(0);
  });

  it('refuses a second promotion BEFORE creating a second exercise', async () => {
    // The whole point of the rule. A refusal that arrived after the call to Content
    // Service would have filed the duplicate first — which is the catalogue rot this
    // phase exists to prevent.
    const probe = makeProbe();
    probe.promote('exercise-9');
    const { handler, created } = makeHandler(probe);

    const result = await handler.execute(new PromoteProbeCommand(probe.id, 'tutor-1'));

    expect(result.error).toBeInstanceOf(ProbeAlreadyPromotedError);
    expect((result.error as ProbeAlreadyPromotedError).exerciseId).toBe('exercise-9');
    expect(created).toHaveLength(0);
  });

  it('promotes a probe whose time is up', async () => {
    // The clock is about answering the question, not about whether it was a good one —
    // and a teacher looking through yesterday's tasks is exactly who this is for.
    const probe = ProbeTask.create({
      userId: 'learner-1',
      subject: { atomType: 'grammar_rule_atom', atomId: 'passive-choice' },
      requiredModality: 'production',
      definition: {
        templateCode: 'fill_in_blank',
        targetLanguage: 'no',
        difficultyLevel: 'B1',
        content: {},
        expectedAnswers: {},
        answerCheckSettings: null,
        instruction: null,
      },
      createdByUserId: 'tutor-1',
      ttlSeconds: -1,
    });
    const { handler } = makeHandler(probe);

    expect(probe.isExpired()).toBe(true);
    expect((await handler.execute(new PromoteProbeCommand(probe.id, 'tutor-1'))).isOk).toBe(true);
  });

  it('records nothing when Content Service would not take it', async () => {
    const probe = makeProbe();
    const { handler, saved } = makeHandler(probe, new ContentClientError(422, 'schema mismatch'));

    const result = await handler.execute(new PromoteProbeCommand(probe.id, 'tutor-1'));

    expect(result.isFail).toBe(true);
    expect(saved).toHaveLength(0);
    expect(probe.promotedExerciseId).toBeNull();
  });

  it('answers "no such probe" once the sweep has taken it', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(new PromoteProbeCommand('gone', 'tutor-1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toBeNull();
  });
});
