import { jest } from '@jest/globals';
import { StartAttemptHandler } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 63 phase 9. `GRADED` means the client is not trusted with the answers. That used
// to be enforced a service away — Content Service dropped the key before the envelope
// left it — and a probe comes from the engine's own table, so nothing upstream takes it
// away. The invariant belongs here, and it has to hold for every template, including the
// ones with no projection of their own (`fill_in_blank` and its like, whose key is a
// plain separate field).

const PROBE_ID = 'a9c5980f-d686-4c18-99a1-0321a20e77b6';

function makeHandler() {
  const definition = {
    exercise: {
      id: PROBE_ID,
      templateCode: 'fill_in_blank',
      targetLanguage: 'no',
      difficultyLevel: 'B1',
      content: { text_with_blanks: 'Huset ___1___ malt i fjor.', word_bank: [] },
      expectedAnswers: { blanks: [{ blank_id: 1, accepted_answers: ['ble'] }] },
      answerCheckSettings: null,
    },
    template: {
      code: 'fill_in_blank',
      contentSchema: {},
      answerSchema: {},
      defaultCheckSettings: {},
      supportedLanguages: null,
    },
    instruction: null,
    axes: { skills: [], focus: [], modality: 'production' as const },
    targets: [
      { itemKey: null, atomType: 'grammar_rule_atom', atomId: 'passive-choice', role: 'focus' },
    ],
    ephemeral: true,
  };

  const saved: Array<{ ephemeral: boolean; itemTargets: unknown[]; modality: string }> = [];
  const attempts = {
    findInProgress: jest.fn(async () => null),
    findOpenBoard: jest.fn(async () => null),
    findLatestReturned: jest.fn(async () => null),
    save: jest.fn(
      async (attempt: { ephemeral: boolean; itemTargets: unknown[]; modality: string }) => {
        saved.push(attempt);
      },
    ),
  } as never;

  const contentClient = {
    getExerciseForAttempt: jest.fn(async () => Result.ok(definition)),
    getPracticedAtoms: jest.fn(async () => Result.ok([])),
  } as never;

  const reviewContext = {
    resolve: jest.fn(async () => ({
      schoolId: null,
      containerId: null,
      groupId: null,
      exercisePath: null,
    })),
  } as never;

  const publisher = { publish: jest.fn(async () => undefined) } as never;

  return {
    handler: new StartAttemptHandler(attempts, contentClient, reviewContext, publisher),
    saved,
  };
}

describe('starting an attempt on a probe', () => {
  it('ships no answer key in GRADED mode, even for a template with no projection', async () => {
    const result = await makeHandler().handler.execute(
      new StartAttemptCommand('learner-1', PROBE_ID, 'no', null, null, 'GRADED', null, null),
    );

    expect(result.value.expectedAnswers).toBeNull();
    expect(JSON.stringify(result.value.exerciseContent)).not.toContain('ble');
  });

  it('still ships it in PRACTICE, which is what that mode is for', async () => {
    const result = await makeHandler().handler.execute(
      new StartAttemptCommand('learner-1', PROBE_ID, 'no', null, null, 'PRACTICE', null, null),
    );

    expect(result.value.expectedAnswers).not.toBeNull();
  });

  it('snapshots onto the attempt that the task was disposable', async () => {
    // The probe is designed to be gone by the time this attempt is marked or its event
    // is read, so the flag has to live on the attempt rather than be looked up.
    const { handler, saved } = makeHandler();

    await handler.execute(
      new StartAttemptCommand('learner-1', PROBE_ID, 'no', null, null, 'GRADED', null, null),
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]!.ephemeral).toBe(true);
    // And the address it will hang its evidence on, and the modality it was asked for.
    expect(saved[0]!.itemTargets).toEqual([
      { itemKey: null, atomType: 'grammar_rule_atom', atomId: 'passive-choice', role: 'focus' },
    ]);
    expect(saved[0]!.modality).toBe('production');
  });
});
