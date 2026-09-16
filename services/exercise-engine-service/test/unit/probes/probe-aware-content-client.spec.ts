import { jest } from '@jest/globals';
import { ProbeAwareContentClient } from '../../../src/modules/probes/infrastructure/content/probe-aware-content-client.js';
import { ProbeTask } from '../../../src/modules/probes/domain/entities/probe-task.entity.js';
import type { IProbeTaskRepository } from '../../../src/modules/probes/domain/repositories/probe-task.repository.js';
import type {
  ExerciseTemplateDefinition,
  IContentClient,
} from '../../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 63 phase 9, step 2. "An attempt on a probe is an ordinary attempt" is not a slogan
// about the runner — it is this class. Everything that runs an attempt reads the task
// through the content port, and this is the only place that knows there are two spaces
// behind it.

const TEMPLATE: ExerciseTemplateDefinition = {
  code: 'fill_in_blank',
  contentSchema: {},
  answerSchema: { type: 'object' },
  defaultCheckSettings: { passingThreshold: 70 },
  supportedLanguages: null,
  isActive: true,
};

function makeProbe(ttlSeconds = 3600) {
  return ProbeTask.create({
    userId: 'learner-1',
    subject: { atomType: 'grammar_rule_atom', atomId: 'passive-choice' },
    requiredModality: 'production',
    definition: {
      templateCode: 'fill_in_blank',
      targetLanguage: 'no',
      difficultyLevel: 'B1',
      content: { sentence: 'Huset ___ malt i fjor.' },
      expectedAnswers: { answer: 'ble' },
      answerCheckSettings: null,
      instruction: null,
    },
    skills: ['written'],
    focus: ['grammar'],
    ttlSeconds,
  });
}

function makeClient(probe: ProbeTask | null) {
  const catalogue = {
    getExerciseForAttempt: jest.fn(async () =>
      Result.ok({
        exercise: {
          id: 'catalogue-1',
          templateCode: 'multiple_choice',
          targetLanguage: 'no',
          difficultyLevel: 'A2',
          content: {},
          expectedAnswers: {},
          answerCheckSettings: null,
        },
        template: TEMPLATE,
        instruction: null,
      }),
    ),
    getPracticedAtoms: jest.fn(async () =>
      Result.ok([{ atomType: 'vocabulary_item', atomId: 'hus' }]),
    ),
    getExercisePlacement: jest.fn(async () =>
      Result.ok({
        containerId: 'course-1',
        containerTitle: 'Ny i Norge',
        moduleId: null,
        moduleTitle: null,
        exerciseTitle: null,
        ownerSchoolId: null,
        ownerUserId: null,
      }),
    ),
    getTemplateByCode: jest.fn(async () => Result.ok(TEMPLATE)),
  } as unknown as IContentClient;

  const probes = {
    findById: jest.fn(async (id: string) => (probe && probe.id === id ? probe : null)),
  } as unknown as IProbeTaskRepository;

  return { client: new ProbeAwareContentClient(catalogue, probes), catalogue };
}

describe('ProbeAwareContentClient', () => {
  it('answers a probe id out of the probe table, with the template fetched by code', async () => {
    const probe = makeProbe();
    const { client, catalogue } = makeClient(probe);

    const result = await client.getExerciseForAttempt(probe.id, 'no', 'GRADED');

    expect(result.isOk).toBe(true);
    expect(result.value.exercise.id).toBe(probe.id);
    expect(result.value.exercise.content).toEqual({ sentence: 'Huset ___ malt i fjor.' });
    expect(result.value.template.answerSchema).toEqual(TEMPLATE.answerSchema);
    expect(catalogue.getExerciseForAttempt).not.toHaveBeenCalled();
  });

  it('carries the required modality as the attempt axes', async () => {
    // The reason a probe is worth making when the catalogue already has exercises on the
    // atom: what is missing is usually not practice but practice of a kind never seen.
    const probe = makeProbe();
    const { client } = makeClient(probe);

    const result = await client.getExerciseForAttempt(probe.id, 'no', 'PRACTICE');

    expect(result.value.axes).toEqual({
      skills: ['written'],
      focus: ['grammar'],
      modality: 'production',
    });
  });

  it('marks the definition ephemeral, so the attempt can snapshot what it was', async () => {
    const probe = makeProbe();
    const { client } = makeClient(probe);

    expect((await client.getExerciseForAttempt(probe.id, 'no', 'PRACTICE')).value.ephemeral).toBe(
      true,
    );
  });

  it('addresses the probe, so the evidence has somewhere to land', async () => {
    const probe = makeProbe();
    const { client } = makeClient(probe);

    expect((await client.getExerciseForAttempt(probe.id, 'no', 'PRACTICE')).value.targets).toEqual([
      { itemKey: null, atomType: 'grammar_rule_atom', atomId: 'passive-choice', role: 'focus' },
    ]);
  });

  it('ships the key in both modes, because the masking step downstream needs it', async () => {
    // `withheldWhereNeeded` in start-attempt applies the template's own rules and is the
    // last hand the document passes through. Several of those rules read the key in order
    // to take it away, so withholding it here would mask a probe *less* than a catalogue
    // exercise, not more.
    const probe = makeProbe();
    const { client } = makeClient(probe);

    const graded = await client.getExerciseForAttempt(probe.id, 'no', 'GRADED');
    expect(graded.value.exercise.expectedAnswers).toEqual({ answer: 'ble' });
  });

  it('refuses an expired probe as "no such exercise"', async () => {
    const probe = makeProbe(-1);
    const { client } = makeClient(probe);

    const result = await client.getExerciseForAttempt(probe.id, 'no', 'PRACTICE');

    expect(result.isFail).toBe(true);
    expect((result.error as ContentClientError).statusCode).toBe(404);
  });

  it('answers no practised atoms and no placement for a probe, without a round trip', async () => {
    // The graph has never heard of it and it sits in no course. Both answered locally: a
    // 404 per probe attempt would be reported as a failure in the log every time.
    const probe = makeProbe();
    const { client, catalogue } = makeClient(probe);

    expect((await client.getPracticedAtoms(probe.id)).value).toEqual([]);
    expect((await client.getExercisePlacement(probe.id)).isFail).toBe(true);
    expect(catalogue.getPracticedAtoms).not.toHaveBeenCalled();
    expect(catalogue.getExercisePlacement).not.toHaveBeenCalled();
  });

  it('hands every other id straight to the catalogue', async () => {
    const { client, catalogue } = makeClient(null);

    const result = await client.getExerciseForAttempt('catalogue-1', 'no', 'GRADED');

    expect(result.value.exercise.id).toBe('catalogue-1');
    expect(catalogue.getExerciseForAttempt).toHaveBeenCalledWith('catalogue-1', 'no', 'GRADED');
    expect((await client.getPracticedAtoms('catalogue-1')).value).toHaveLength(1);
    expect((await client.getExercisePlacement('catalogue-1')).isOk).toBe(true);
  });

  it('fails the probe when its template cannot be fetched', async () => {
    // Rather than guessing a schema: the answer schema is what the submission is
    // validated against, and a made-up one would judge the learner by a rule nobody wrote.
    const probe = makeProbe();
    const { client, catalogue } = makeClient(probe);
    (catalogue.getTemplateByCode as jest.Mock<never>) = jest.fn(async () =>
      Result.fail(new ContentClientError(503, 'content is down')),
    ) as never;

    const result = await client.getExerciseForAttempt(probe.id, 'no', 'PRACTICE');

    expect(result.isFail).toBe(true);
    expect((result.error as ContentClientError).statusCode).toBe(503);
  });
});
