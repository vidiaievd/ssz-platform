import { jest } from '@jest/globals';
import type { Logger } from '@nestjs/common';
import {
  atomsFlagged,
  publishAtomsFlagged,
} from '../../../src/modules/attempts/application/services/flagged-atoms.js';
import type { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

const attempt = {
  id: 'att-1',
  userId: 'user-1',
  exerciseId: 'ex-1',
  templateCode: 'writing_task',
  schoolId: 'school-1',
  containerId: 'course-1',
  groupId: 'group-1',
  itemTargets: [
    { itemKey: null, atomType: 'grammar_rule_atom', atomId: 'atom-v2', role: 'focus' },
    { itemKey: 'g1', atomType: 'grammar_rule_atom', atomId: 'atom-gap', role: 'context' },
    { itemKey: null, atomType: 'vocabulary_item', atomId: 'atom-x', role: 'focus' },
  ],
} as unknown as Attempt;

const now = new Date('2026-11-01T12:00:00Z');
const grammar = (atomId: string) => ({ atomType: 'grammar_rule_atom', atomId });

describe('atomsFlagged (plan 85, step 4)', () => {
  it('keeps each atom once, in the order first named, and marks the exercise’s own targets', () => {
    const payload = atomsFlagged(
      attempt,
      'ai_precheck',
      [grammar('atom-x'), null, grammar('atom-v2'), grammar('atom-x'), grammar('atom-gap'), undefined],
      now,
    );

    expect(payload).toEqual({
      userId: 'user-1',
      exerciseId: 'ex-1',
      attemptId: 'att-1',
      templateCode: 'writing_task',
      source: 'ai_precheck',
      // A target is matched by kind as well as id: `atom-x` is a word target, not this rule.
      atoms: [
        { atomType: 'grammar_rule_atom', atomId: 'atom-x', inExerciseTargets: false },
        { atomType: 'grammar_rule_atom', atomId: 'atom-v2', inExerciseTargets: true },
        { atomType: 'grammar_rule_atom', atomId: 'atom-gap', inExerciseTargets: true },
      ],
      schoolId: 'school-1',
      containerId: 'course-1',
      groupId: 'group-1',
      occurredAt: '2026-11-01T12:00:00.000Z',
    });
  });

  it('is null when nothing was named', () => {
    expect(atomsFlagged(attempt, 'ai_review', [], now)).toBeNull();
    expect(atomsFlagged(attempt, 'ai_review', [null, { atomType: 'grammar_rule_atom', atomId: '' }], now)).toBeNull();
  });
});

describe('publishAtomsFlagged', () => {
  const logger = { warn: jest.fn() } as unknown as Logger;

  it('publishes nothing for no letter', async () => {
    const publisher = { publish: jest.fn(() => Promise.resolve()) };
    await publishAtomsFlagged(publisher, logger, null);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('swallows a broker failure', async () => {
    const publisher = { publish: jest.fn(() => Promise.reject(new Error('down'))) };
    const payload = atomsFlagged(attempt, 'ai_precheck', [grammar('atom-v2')], now);

    await expect(publishAtomsFlagged(publisher, logger, payload)).resolves.toBeUndefined();
    expect(publisher.publish).toHaveBeenCalledWith('exercise.feedback.atoms_flagged', payload);
    expect(logger.warn).toHaveBeenCalled();
  });
});
