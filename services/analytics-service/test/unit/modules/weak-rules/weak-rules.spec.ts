import { aggregateWeakRules, flagRowsOf, parseWindow, windowSince } from '../../../../src/modules/weak-rules/domain/weak-rules.js';

const payload = {
  userId: 'u1',
  exerciseId: 'e1',
  attemptId: 'a1',
  templateCode: 'writing_task',
  source: 'ai_precheck' as const,
  atoms: [
    { atomType: 'grammar_rule_atom', atomId: 'x1', inExerciseTargets: false },
    { atomType: 'grammar_rule_atom', atomId: 'x1', inExerciseTargets: true },
    { atomType: 'lexeme', atomId: 'w1', inExerciseTargets: false },
    { atomType: 'grammar_rule_atom', atomId: 'x2', inExerciseTargets: true },
  ],
  schoolId: 's1',
  containerId: 'c1',
  groupId: null,
  occurredAt: '2026-11-01T23:30:00.000Z',
};

describe('flagRowsOf', () => {
  it('keeps grammar rule atoms once each, on the signal\'s own UTC day', () => {
    const rows = flagRowsOf(payload)!;

    expect(rows.map((r) => r.atomId)).toEqual(['x1', 'x2']);
    expect(rows[0]).toMatchObject({ day: '2026-11-01', schoolId: 's1', groupId: null, containerId: 'c1' });
  });

  it('rejects a malformed event', () => {
    expect(flagRowsOf(undefined)).toBeNull();
    expect(flagRowsOf({ ...payload, source: 'robot' as never })).toBeNull();
    expect(flagRowsOf({ ...payload, occurredAt: 'nope' })).toBeNull();
    expect(flagRowsOf({ ...payload, atoms: undefined })).toBeNull();
  });
});

describe('windows', () => {
  const now = new Date('2026-11-01T10:00:00Z');

  it('counts today as the last of N days', () => {
    expect(windowSince('7', now)).toBe('2026-10-26');
    expect(windowSince('30', now)).toBe('2026-10-03');
    expect(windowSince('course', now)).toBeNull();
  });

  it('defaults to 30', () => {
    expect(parseWindow(undefined)).toBe('30');
    expect(parseWindow('9')).toBe('30');
    expect(parseWindow('course')).toBe('course');
  });
});

describe('aggregateWeakRules', () => {
  const at = (d: string) => new Date(`2026-10-${d}T10:00:00Z`);

  it('orders by flags, counts learners and sources, keeps the latest time', () => {
    const rules = aggregateWeakRules([
      { userId: 'u1', atomId: 'a', exerciseId: 'e1', source: 'ai_precheck', flaggedAt: at('10') },
      { userId: 'u2', atomId: 'a', exerciseId: 'e1', source: 'teacher', flaggedAt: at('12') },
      { userId: 'u1', atomId: 'a', exerciseId: 'e2', source: 'ai_precheck', flaggedAt: at('11') },
      { userId: 'u1', atomId: 'b', exerciseId: 'e1', source: 'ai_review', flaggedAt: at('13') },
    ]);

    expect(rules.map((r) => r.atomId)).toEqual(['a', 'b']);
    expect(rules[0]).toMatchObject({
      flags: 3,
      learners: 2,
      bySource: { ai_precheck: 2, ai_review: 0, teacher: 1 },
      lastFlaggedAt: at('12').toISOString(),
    });
  });

  it('is empty for no signals', () => {
    expect(aggregateWeakRules([])).toEqual([]);
  });
});
