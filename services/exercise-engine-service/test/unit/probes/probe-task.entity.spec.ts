import { ProbeTask } from '../../../src/modules/probes/domain/entities/probe-task.entity.js';
import type { ProbeDefinition } from '../../../src/modules/probes/domain/entities/probe-task.entity.js';
import {
  ProbeExpiredError,
  ProbeNotYoursError,
} from '../../../src/modules/probes/domain/exceptions/probe.errors.js';

// Plan 63 phase 9. A probe is a question asked once: dealt to one learner, aimed at one
// atom, worth nothing after its time. The rules below are the ones that make the evidence
// it produces trustworthy — who may answer it, when it stops counting, and where the
// answer lands.

const definition: ProbeDefinition = {
  templateCode: 'fill_in_blank',
  targetLanguage: 'no',
  difficultyLevel: 'B1',
  content: { sentence: 'Huset ___ malt i fjor.' },
  expectedAnswers: { answer: 'ble' },
  answerCheckSettings: null,
  instruction: null,
};

const subject = { atomType: 'grammar_rule_atom', atomId: 'passive-choice' };

function makeProbe(overrides: Partial<Parameters<typeof ProbeTask.create>[0]> = {}) {
  return ProbeTask.create({
    userId: 'learner-1',
    subject,
    requiredModality: 'production',
    definition,
    ttlSeconds: 3600,
    ...overrides,
  });
}

describe('ProbeTask', () => {
  describe('the address the evidence hangs on', () => {
    it('addresses the subject atom as the whole task when the builder names nothing', () => {
      expect(makeProbe().targets).toEqual([
        { itemKey: null, atomType: 'grammar_rule_atom', atomId: 'passive-choice', role: 'focus' },
      ]);
    });

    it('appends the subject to targets that never mention it', () => {
      // Otherwise a probe could be made *about* an atom and produce no evidence about it:
      // the addresses are where the rating lands, and three gaps addressing three other
      // atoms would answer a question nobody asked.
      const probe = makeProbe({
        targets: [{ itemKey: 's1#3', atomType: 'vocabulary_item', atomId: 'hus', role: 'context' }],
      });

      expect(probe.targets).toHaveLength(2);
      expect(probe.targets.at(-1)).toEqual({
        itemKey: null,
        atomType: 'grammar_rule_atom',
        atomId: 'passive-choice',
        role: 'focus',
      });
    });

    it('leaves the builder alone when it already addressed the subject, role and all', () => {
      // A builder that deliberately called the subject `context` has said something about
      // how much its evidence weighs, and the default is not the place to overrule it.
      const targets = [
        {
          itemKey: 's1#3',
          atomType: 'grammar_rule_atom',
          atomId: 'passive-choice',
          role: 'context' as const,
        },
      ];

      expect(makeProbe({ targets }).targets).toEqual(targets);
    });
  });

  describe('opening one', () => {
    it('opens for the learner it was dealt to', () => {
      expect(makeProbe().openableBy('learner-1').isOk).toBe(true);
    });

    it('refuses anyone else, and says so before it says anything about the time', () => {
      // A stranger holding a guessed id learns nothing about it — not even whether it is
      // still alive.
      const probe = makeProbe({ ttlSeconds: 1 });
      const result = probe.openableBy('learner-2', new Date(Date.now() + 10_000));

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(ProbeNotYoursError);
    });

    it('refuses its own learner once the time is up', () => {
      const probe = makeProbe({ ttlSeconds: 60 });
      const result = probe.openableBy('learner-1', new Date(Date.now() + 61_000));

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(ProbeExpiredError);
    });

    it('treats the expiry instant itself as past', () => {
      const now = new Date('2026-09-16T12:00:00Z');
      const probe = makeProbe({ ttlSeconds: 60, now });

      expect(probe.isExpired(new Date('2026-09-16T12:01:00Z'))).toBe(true);
      expect(probe.secondsRemaining(new Date('2026-09-16T12:01:30Z'))).toBe(0);
    });
  });

  describe('promotion', () => {
    it('records which exercise it was kept as, and still expires', () => {
      const probe = makeProbe();
      expect(probe.promote('exercise-9').isOk).toBe(true);
      expect(probe.promotedExerciseId).toBe('exercise-9');
      expect(probe.promotedAt).not.toBeNull();
    });

    it('refuses a second promotion', () => {
      // A second one would file a second near-identical exercise — the catalogue rot this
      // whole phase exists to prevent.
      const probe = makeProbe();
      probe.promote('exercise-9');

      const again = probe.promote('exercise-10');
      expect(again.isFail).toBe(true);
      expect(probe.promotedExerciseId).toBe('exercise-9');
    });
  });
});
