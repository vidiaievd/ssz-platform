// The cascades — handoff CLAUDE.md: "the cascades and the `also` acceptance logic are where
// bugs live". One test per acceptance criterion it closes.

import { describe, expect, it } from 'vitest';

import { coverage } from './derive.js';
import {
  addBucket,
  appendItems,
  assignBucket,
  canAddBucket,
  canRemoveBucket,
  moveBucket,
  moveItem,
  removeBucket,
  removeItem,
  replaceBuckets,
  setOverride,
  setUseNone,
  toggleAlso,
  updateSettings,
} from './edits.js';
import { emptyContent, newItem, SB_NONE } from './model.js';
import { EI, EN, ET, exercise, item } from './fixtures.test-support.js';

describe('buckets', () => {
  it('AC-B1: a new draft has two empty buckets and room for more', () => {
    const ex = emptyContent();
    expect(ex.buckets).toHaveLength(2);
    expect(ex.buckets.every((b) => b.label === '' && b.rule === '')).toBe(true);
    expect(canAddBucket(ex)).toBe(true);
  });

  it('AC-B2: five buckets, the refusal bucket included, is the cap', () => {
    let ex = setUseNone(exercise(), true); // en, ei, et + none = 4
    ex = addBucket(ex, 'x');
    expect(canAddBucket(ex)).toBe(false);
    expect(addBucket(ex, 'y')).toBe(ex);
  });

  it('AC-B3: two buckets cannot be reduced', () => {
    const ex = exercise({ buckets: [EN, EI] });
    expect(canRemoveBucket(ex)).toBe(false);
    expect(removeBucket(ex, EN.id)).toBe(ex);
  });

  it('AC-B4: deleting a bucket unassigns its items, drops it from also and from fb.ov', () => {
    let ex = exercise();
    ex = toggleAlso(ex, 'i4', EN.id); // bok: ei, also en
    ex = setOverride(ex, 'i1', ET.id, 'Not et.');
    ex = setOverride(ex, 'i3', EN.id, 'Not en.');

    const out = removeBucket(ex, EN.id);

    expect(out.items).toHaveLength(6);
    expect(out.items.find((i) => i.id === 'i1')?.bucketId).toBeNull();
    expect(out.items.find((i) => i.id === 'i2')?.bucketId).toBeNull();
    expect(out.items.find((i) => i.id === 'i4')?.also).toEqual([]);
    expect(out.fb['i3']?.ov).toEqual({});
    // A cell for another bucket survives.
    expect(out.fb['i1']?.ov).toEqual({ [ET.id]: 'Not et.' });
  });

  it('AC-B6: switching the refusal bucket off unassigns, never deletes', () => {
    let ex = setUseNone(exercise(), true);
    ex = { ...ex, items: [...ex.items, item('i7', 'å bli', SB_NONE)] };
    ex = setOverride(ex, 'i1', SB_NONE, 'A noun has a gender.');

    const out = setUseNone(ex, false);

    expect(out.items).toHaveLength(7);
    expect(out.items.find((i) => i.id === 'i7')?.bucketId).toBeNull();
    expect(out.fb['i1']?.ov).toEqual({});
  });

  it('AC-B7: reordering buckets changes no id, explanation or coverage value', () => {
    const ex = setOverride(exercise(), 'i1', EI.id, 'Not ei.');
    const out = moveBucket(ex, 0, 2);

    expect(out.buckets.map((b) => b.id)).toEqual([EI.id, ET.id, EN.id]);
    expect(out.items).toEqual(ex.items);
    expect(out.fb).toEqual(ex.fb);
    expect(coverage(out)).toEqual(coverage(ex));
  });

  it('a starter set replaces the buckets through the same cascade', () => {
    const out = replaceBuckets(exercise(), [['a', ''], ['b', '']]);
    expect(out.buckets.map((b) => b.label)).toEqual(['a', 'b']);
    expect(out.items.every((i) => i.bucketId === null)).toBe(true);
  });

  it('the refusal bucket cannot push past the cap', () => {
    let ex = exercise();
    ex = addBucket(addBucket(ex, 'x'), 'y'); // five authored
    expect(setUseNone(ex, true).useNone).toBe(false);
  });
});

describe('items', () => {
  it('AC-I1: clicking the primary bucket again unassigns the item', () => {
    const out = assignBucket(exercise(), 'i1', EN.id);
    expect(out.items[0]?.bucketId).toBeNull();
  });

  it('AC-I2: a new primary leaves also', () => {
    let ex = toggleAlso(exercise(), 'i4', EN.id);
    ex = assignBucket(ex, 'i4', EN.id);
    expect(ex.items[3]?.bucketId).toBe(EN.id);
    expect(ex.items[3]?.also).toEqual([]);
  });

  it('also cannot hold the primary, and needs a primary at all', () => {
    expect(toggleAlso(exercise(), 'i1', EN.id).items[0]?.also).toEqual([]);
    const unassigned = assignBucket(exercise(), 'i1', EN.id);
    expect(toggleAlso(unassigned, 'i1', EI.id).items[0]?.also).toEqual([]);
  });

  it('AC-I3: reordering keeps explanations on their items', () => {
    const ex = setOverride(exercise(), 'i1', EI.id, 'Bil is en.');
    const out = moveItem(ex, 0, 5);
    expect(out.items[5]?.id).toBe('i1');
    expect(out.fb['i1']?.ov[EI.id]).toBe('Bil is en.');
  });

  it('AC-I8: deleting an item deletes its feedback', () => {
    const out = removeItem(exercise(), 'i1');
    expect(out.items.map((i) => i.id)).not.toContain('i1');
    expect(out.fb).not.toHaveProperty('i1');
  });

  it('pasted items replace the blank scaffold rows rather than sit under them', () => {
    const ex = emptyContent();
    const out = appendItems(ex, [newItem('bil', null)]);
    expect(out.items.map((i) => i.text)).toEqual(['bil']);
  });
});

describe('feedback and settings', () => {
  it('an empty override removes the cell', () => {
    const ex = setOverride(exercise(), 'i1', EI.id, 'text');
    expect(setOverride(ex, 'i1', EI.id, '  ').fb['i1']?.ov).toEqual({});
  });

  it('AC-D4: a settings change touches no bucket or item', () => {
    const ex = exercise();
    const out = updateSettings(ex, { shuffle: false, attempts: 2, threshold: 90 });
    expect(out.buckets).toBe(ex.buckets);
    expect(out.items).toBe(ex.items);
  });
});
