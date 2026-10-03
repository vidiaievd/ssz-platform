import { sortIntoBucketsViolations } from './sort-into-buckets-preflight.js';

// What earns this file is that an unassigned item does not fail loudly — it disappears:
// the projection decides which items a student sees by asking the key column, so an item
// with no bucket is dropped and the board publishes clean with fewer tiles than written.

const settings = {
  shuffle: true,
  showRemaining: false,
  hints: true,
  revealKey: true,
  attempts: 0,
  threshold: 70,
};

/** A finished board: two buckets with rules, four assigned, explained items. */
function ready() {
  const ids = ['i1', 'i2', 'i3', 'i4'];
  return {
    id: 'ex-1',
    content: {
      title: 'Kjønn',
      instruction: 'Sorter substantivene.',
      buckets: [
        { id: 'b1', label: 'en', rule: 'Hankjønn.' },
        { id: 'b2', label: 'et', rule: 'Intetkjønn.' },
      ],
      useNone: false,
      noneLabel: '',
      items: [
        { id: 'i1', text: 'bil' },
        { id: 'i2', text: 'gutt' },
        { id: 'i3', text: 'hus' },
        { id: 'i4', text: 'eple' },
      ],
      settings,
    },
    expectedAnswers: {
      items: Object.fromEntries(
        ids.map((id, n) => [
          id,
          { bucketId: n < 2 ? 'b1' : 'b2', also: [], why: '', fb: { def: 'Because.', ov: {} } },
        ]),
      ),
    },
  };
}

describe('sortIntoBucketsViolations', () => {
  it('passes a finished board', () => {
    expect(sortIntoBucketsViolations(ready())).toEqual([]);
  });

  it('blocks an unassigned item, which the projection would silently drop', () => {
    const exercise = ready();
    exercise.expectedAnswers.items['i4'].bucketId = null as unknown as string;
    const codes = sortIntoBucketsViolations(exercise).map((v) => [v.ruleCode, v.severity]);
    expect(codes).toContainEqual(['SORTINTOBUCKETS_SB_ITEM_UNASSIGNED', 'blocker']);
    expect(codes).toContainEqual(['SORTINTOBUCKETS_SB_ITEMS_TOO_FEW', 'blocker']);
  });

  it('blocks an item with no explanation for a wrong bucket', () => {
    const exercise = ready();
    exercise.expectedAnswers.items['i1'].fb.def = '';
    const violation = sortIntoBucketsViolations(exercise).find(
      (v) => v.ruleCode === 'SORTINTOBUCKETS_SB_NO_EXPLANATION',
    );
    expect(violation).toMatchObject({ severity: 'blocker', itemId: 'ex-1' });
    expect(violation?.detail).toContain('1 item has no explanation');
  });

  it('reports one violation per code, counting the items', () => {
    const exercise = ready();
    exercise.expectedAnswers.items['i1'].fb.def = '';
    exercise.expectedAnswers.items['i2'].fb.def = '';
    const found = sortIntoBucketsViolations(exercise).filter(
      (v) => v.ruleCode === 'SORTINTOBUCKETS_SB_NO_EXPLANATION',
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toContain('2 items have');
  });

  it('reports a warning as a warning', () => {
    const exercise = ready();
    exercise.content.buckets[0].rule = '';
    expect(sortIntoBucketsViolations(exercise)).toEqual([
      expect.objectContaining({
        ruleCode: 'SORTINTOBUCKETS_SB_BUCKET_NO_RULE',
        severity: 'warning',
      }),
    ]);
  });

  it('warns that the counter lowers the evidence, even beside a refusal bucket', () => {
    const exercise = ready();
    exercise.content.settings = { ...exercise.content.settings, showRemaining: true };
    exercise.content.useNone = true;
    exercise.content.noneLabel = 'Ingen av delene';
    const found = sortIntoBucketsViolations(exercise);
    expect(found).toContainEqual(
      expect.objectContaining({
        ruleCode: 'SORTINTOBUCKETS_SB_CEILING_LOWERED',
        severity: 'warning',
        detail: expect.stringContaining('weaker evidence'),
      }),
    );
    expect(found.map((v) => v.ruleCode)).not.toContain('SORTINTOBUCKETS_SB_COUNTER_ARITHMETIC');
  });

  it('refuses an empty document rather than publishing an empty board', () => {
    const codes = sortIntoBucketsViolations({ id: 'x', content: {}, expectedAnswers: {} }).map(
      (v) => v.ruleCode,
    );
    expect(codes).toContain('SORTINTOBUCKETS_SB_BUCKETS_TOO_FEW');
    expect(codes).toContain('SORTINTOBUCKETS_SB_ITEMS_TOO_FEW');
  });
});
