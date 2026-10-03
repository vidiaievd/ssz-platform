// SPEC_data_model §Issues — every code fires on its broken model, plus the corrections
// of plan 66 §4.2.

import { describe, expect, it } from 'vitest';

import { ceilingCause } from './derive.js';
import { setUseNone, toggleAlso, updateBucket } from './edits.js';
import { blockers, isReady, issues, stepState, warnings } from './issues.js';
import { emptyContent, SB_NONE } from './model.js';
import { codes, EI, EN, ET, exercise, item, settings } from './fixtures.test-support.js';

describe('a finished document', () => {
  it('raises nothing', () => {
    expect(issues(exercise())).toEqual([]);
    expect(isReady(exercise())).toBe(true);
  });
});

describe('step 1 — buckets', () => {
  it('blocks under two labelled buckets', () => {
    const ex = exercise({ buckets: [EN, { ...EI, label: '' }] });
    expect(codes(blockers(ex))).toContain('SB_BUCKETS_TOO_FEW');
  });

  it('names an unlabelled bucket, the refusal bucket included', () => {
    const ex = setUseNone(exercise({ noneLabel: '' }), true);
    expect(blockers(ex)).toContainEqual({
      code: 'SB_BUCKET_UNLABELLED',
      level: 'blocker',
      step: 1,
      bucketId: SB_NONE,
    });
  });

  it('AC-B5: labels that normalise alike are a blocker, on the second', () => {
    const ex = updateBucket(exercise(), EI.id, { label: '  EN ' });
    expect(blockers(ex)).toContainEqual({
      code: 'SB_BUCKET_LABEL_DUPLICATE',
      level: 'blocker',
      step: 1,
      bucketId: EI.id,
    });
  });

  it('the refusal label takes part in the duplicate check (§4.2)', () => {
    const ex = setUseNone(exercise({ noneLabel: 'et' }), true);
    expect(codes(blockers(ex))).toContain('SB_BUCKET_LABEL_DUPLICATE');
  });

  it('blocks over five buckets', () => {
    const extra = [1, 2, 3].map((n) => ({ id: `x${n}`, label: `x${n}`, rule: 'r' }));
    const ex = exercise({ buckets: [EN, EI, ET, ...extra] });
    expect(codes(blockers(ex))).toContain('SB_BUCKETS_TOO_MANY');
  });
});

describe('step 2 — items', () => {
  it('names an item with text and no bucket', () => {
    const ex = exercise({ items: [...exercise().items, item('i7', 'stol', null)] });
    expect(blockers(ex)).toContainEqual({
      code: 'SB_ITEM_UNASSIGNED',
      level: 'blocker',
      step: 2,
      itemId: 'i7',
    });
  });

  it('an item pointing at a removed bucket is unassigned', () => {
    const ex = exercise({ items: [...exercise().items, item('i7', 'stol', 'gone')] });
    expect(codes(blockers(ex))).toContain('SB_ITEM_UNASSIGNED');
  });

  it('AC-I7: fewer than four ready items is a blocker', () => {
    const ex = exercise({ items: exercise().items.slice(0, 3) });
    expect(codes(blockers(ex))).toContain('SB_ITEMS_TOO_FEW');
  });

  it('two ready items that normalise alike are a blocker', () => {
    const ex = exercise({ items: [...exercise().items, item('i7', ' Bil ', EI.id)] });
    expect(blockers(ex)).toContainEqual({
      code: 'SB_ITEM_DUPLICATE',
      level: 'blocker',
      step: 2,
      itemId: 'i7',
    });
  });

  it('AC-I5: a non-refusal bucket with no item is a blocker', () => {
    const ex = exercise({ items: exercise().items.filter((i) => i.bucketId !== ET.id) });
    expect(blockers(ex)).toContainEqual({
      code: 'SB_BUCKET_EMPTY',
      level: 'blocker',
      step: 2,
      bucketId: ET.id,
    });
  });

  it('an empty refusal bucket is fine', () => {
    expect(issues(setUseNone(exercise(), true))).toEqual([]);
  });

  it('warns per bucket under two items, not on average (§4.2)', () => {
    const items = [
      item('i1', 'bil', EN.id),
      item('i2', 'gutt', EN.id),
      item('i3', 'mann', EN.id),
      item('i4', 'stol', EN.id),
      item('i5', 'jente', EI.id),
      item('i6', 'hus', ET.id),
      item('i7', 'eple', ET.id),
    ];
    const fb = Object.fromEntries(items.map((i) => [i.id, { def: 'd', ov: {} }]));
    const ex = exercise({ items, fb });
    // Seven items over three buckets is above two on average; `ei` alone is starved.
    expect(warnings(ex)).toContainEqual({
      code: 'SB_THIN_BUCKETS',
      level: 'warning',
      step: 2,
      bucketId: EI.id,
      count: 1,
    });
  });

  it('AC-I6: over 60 % in one bucket is a warning, never a blocker', () => {
    const items = [
      item('i1', 'bil', EN.id),
      item('i2', 'gutt', EN.id),
      item('i3', 'mann', EN.id),
      item('i4', 'stol', EN.id),
      item('i5', 'jente', EI.id),
      item('i6', 'hus', ET.id),
    ];
    const fb = Object.fromEntries(items.map((i) => [i.id, { def: 'd', ov: {} }]));
    const ex = exercise({ items, fb });
    expect(codes(warnings(ex))).toContain('SB_SKEWED');
    expect(codes(blockers(ex))).not.toContain('SB_SKEWED');
  });

  it('does not call five items skewed — the share means nothing under six', () => {
    const items = [
      item('i1', 'bil', EN.id),
      item('i2', 'gutt', EN.id),
      item('i3', 'mann', EN.id),
      item('i4', 'jente', EI.id),
      item('i5', 'hus', ET.id),
    ];
    expect(codes(issues(exercise({ items })))).not.toContain('SB_SKEWED');
  });

  it('warns when most items accept several buckets', () => {
    let ex = exercise();
    for (const id of ['i1', 'i2', 'i3', 'i4']) ex = toggleAlso(ex, id, ET.id);
    expect(codes(warnings(ex))).toContain('SB_MULTI_HEAVY');
  });

  it('warns on an item over six words', () => {
    const items = exercise().items.map((i) =>
      i.id === 'i1' ? { ...i, text: 'en  veldig lang setning med mange ord' } : i,
    );
    expect(warnings(exercise({ items }))).toContainEqual({
      code: 'SB_ITEM_LONG',
      level: 'warning',
      step: 2,
      itemId: 'i1',
      words: 7,
    });
  });
});

describe('step 3 — feedback', () => {
  it('AC-F1: a ready item without the default explanation is a blocker', () => {
    const ex = exercise({ fb: { ...exercise().fb, i2: { def: ' ', ov: {} } } });
    expect(blockers(ex)).toContainEqual({
      code: 'SB_NO_EXPLANATION',
      level: 'blocker',
      step: 3,
      itemId: 'i2',
    });
    expect(isReady(ex)).toBe(false);
  });

  it('AC-F4: a bucket without a rule is a warning and the exercise stays ready', () => {
    const ex = updateBucket(exercise(), EN.id, { rule: '' });
    expect(codes(warnings(ex))).toContain('SB_BUCKET_NO_RULE');
    expect(isReady(ex)).toBe(true);
  });
});

describe('step 4 — difficulty', () => {
  it('AC-D1: the counter without a refusal bucket raises the arithmetic warning', () => {
    const ex = exercise({ settings: settings({ showRemaining: true }) });
    expect(codes(warnings(ex))).toContain('SB_COUNTER_ARITHMETIC');
    expect(codes(issues(setUseNone(ex, true)))).not.toContain('SB_COUNTER_ARITHMETIC');
  });

  it('the counter lowers the evidence ceiling with or without a refusal bucket (phase 9)', () => {
    const ex = exercise({ settings: settings({ showRemaining: true }) });
    expect(warnings(ex)).toContainEqual({
      code: 'SB_CEILING_LOWERED',
      level: 'warning',
      step: 4,
      cause: 'counter',
    });
    // The refusal bucket silences the arithmetic, not the ceiling — the engine lowers both.
    const withNone = setUseNone(ex, true);
    expect(codes(warnings(withNone))).not.toContain('SB_COUNTER_ARITHMETIC');
    expect(codes(warnings(withNone))).toContain('SB_CEILING_LOWERED');
    expect(codes(blockers(withNone))).not.toContain('SB_CEILING_LOWERED');
  });

  it('a skewed board lowers the ceiling too, and both causes are named together', () => {
    const items = [
      item('i1', 'bil', EN.id),
      item('i2', 'gutt', EN.id),
      item('i3', 'mann', EN.id),
      item('i4', 'stol', EN.id),
      item('i5', 'jente', EI.id),
      item('i6', 'hus', ET.id),
    ];
    const fb = Object.fromEntries(items.map((i) => [i.id, { def: 'd', ov: {} }]));
    const skewed = exercise({ items, fb });
    expect(ceilingCause(skewed)).toBe('skew');
    expect(ceilingCause({ ...skewed, settings: settings({ showRemaining: true }) })).toBe('both');
    expect(ceilingCause(exercise())).toBeNull();
    expect(codes(issues(exercise()))).not.toContain('SB_CEILING_LOWERED');
  });

  it('one attempt with the key on is a warning', () => {
    const ex = exercise({ settings: settings({ attempts: 1, revealKey: true }) });
    expect(codes(warnings(ex))).toContain('SB_ONE_SHOT_KEY');
  });
});

describe('stepState', () => {
  it('a new document shows dashed dots, yet is not ready (§4.2)', () => {
    const ex = emptyContent();
    expect(stepState(ex, 1).s).toBe('empty');
    expect(stepState(ex, 2).s).toBe('empty');
    expect(stepState(ex, 3).s).toBe('empty');
    expect(stepState(ex, 4).s).toBe('ok');
    expect(isReady(ex)).toBe(false);
  });

  it('counts the blockers of a started step', () => {
    const ex = exercise({ items: exercise().items.slice(0, 3) });
    expect(stepState(ex, 2)).toEqual({ s: 'err', errs: 2 }); // too few + et empty
  });

  it('is amber on warnings alone', () => {
    const ex = updateBucket(exercise(), EN.id, { rule: '' });
    expect(stepState(ex, 3)).toEqual({ s: 'warn', errs: 0 });
  });

  it('is green on a finished step', () => {
    expect(stepState(exercise(), 2)).toEqual({ s: 'ok', errs: 0 });
  });
});
