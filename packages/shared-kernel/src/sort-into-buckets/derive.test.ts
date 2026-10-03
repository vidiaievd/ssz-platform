import { describe, expect, it } from 'vitest';

import {
  accepted,
  balance,
  buckets,
  cells,
  coverage,
  firstClause,
  isSkewed,
  readyItems,
} from './derive.js';
import { appendItems, setOverride, setUseNone, toggleAlso } from './edits.js';
import { parseBulk } from './bulk.js';
import { emptyContent } from './model.js';
import { noneLabelFor, packFor, presetsFor } from './presets.js';
import { shuffled } from './shuffle.js';
import { EI, EN, ET, exercise, item } from './fixtures.test-support.js';

describe('derived values', () => {
  it('adds the refusal bucket last when it is on', () => {
    expect(buckets(setUseNone(exercise(), true)).map((b) => b.id)).toEqual([EN.id, EI.id, ET.id, 'none']);
  });

  it('accepted is the primary first, then also', () => {
    expect(accepted(item('x', 'bok', EI.id, { also: [EN.id] }))).toEqual([EI.id, EN.id]);
    expect(accepted(item('x', 'bok', null, { also: [EN.id] }))).toEqual([]);
  });

  it('AC-F3: an item accepting two buckets has neither in the matrix', () => {
    const ex = toggleAlso(exercise(), 'i4', EN.id);
    const own = cells(ex).filter((c) => c.itemId === 'i4').map((c) => c.bucketId);
    expect(own).toEqual([ET.id]);
  });

  it('coverage counts written cells and missing defaults', () => {
    let ex = setOverride(exercise(), 'i1', EI.id, 'x');
    ex = { ...ex, fb: { ...ex.fb, i2: { def: '', ov: {} } } };
    expect(coverage(ex)).toEqual({ total: 12, written: 1, noDefault: 1 });
  });

  it('balance reports a count and share per bucket', () => {
    expect(balance(exercise()).map((b) => b.count)).toEqual([2, 2, 2]);
    expect(isSkewed(exercise())).toBe(false);
  });

  it('readyItems needs text and a live bucket', () => {
    const ex = exercise({ items: [item('a', 'x', EN.id), item('b', '', EN.id), item('c', 'y', 'gone')] });
    expect(readyItems(ex).map((i) => i.id)).toEqual(['a']);
  });

  it('firstClause cuts at the first clause mark', () => {
    expect(firstClause('Hankjønn. Bestemt form -en.')).toBe('Hankjønn');
    expect(firstClause('Hunkjønn: ei bok')).toBe('Hunkjønn');
    expect(firstClause('Står foran infinitiv — å lese')).toBe('Står foran infinitiv');
    expect(firstClause('  bare en  ')).toBe('bare en');
    expect(firstClause('drikke-drakk')).toBe('drikke-drakk');
  });
});

describe('bulk paste', () => {
  it('reads every separator and matches labels loosely', () => {
    const { items, unmatched } = parseBulk(exercise(), 'bil | EN\nbok\tei\nhus, et\neple — et');
    expect(items.map((i) => [i.text, i.bucketId])).toEqual([
      ['bil', EN.id],
      ['bok', EI.id],
      ['hus', ET.id],
      ['eple', ET.id],
    ]);
    expect(unmatched).toBe(0);
  });

  it('AC-I4: an unknown label leaves the item unassigned and is counted', () => {
    const { items, unmatched } = parseBulk(exercise(), 'stol | den\nbord\n\n');
    expect(items.map((i) => i.bucketId)).toEqual([null, null]);
    expect(unmatched).toBe(2);
    expect(appendItems(exercise(), items).buckets).toHaveLength(3);
  });
});

describe('language packs — AC-X7', () => {
  it('offers Norwegian starter sets to a Norwegian course only', () => {
    expect(presetsFor('nb-NO').map((p) => p.id)).toContain('gender');
    expect(presetsFor('xx')).toEqual([]);
    expect(packFor(undefined)).toBeNull();
  });

  it('every pack has a refusal label and well-formed sets', () => {
    for (const lang of ['nb', 'en', 'uk', 'ru']) {
      expect(noneLabelFor(lang)).not.toBe('');
      for (const preset of presetsFor(lang)) {
        expect(preset.buckets.length).toBeGreaterThanOrEqual(2);
        expect(preset.buckets.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('a new document carries no Norwegian', () => {
    const ex = emptyContent(noneLabelFor('uk'));
    expect(ex.instruction).toBe('');
    expect(ex.noneLabel).toBe('Жодне з цих');
    expect(emptyContent().noneLabel).toBe('');
  });
});

describe('shuffle', () => {
  it('is stable for a seed and a permutation of the input', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    expect(shuffled(xs, 7)).toEqual(shuffled(xs, 7));
    expect([...shuffled(xs, 7)].sort()).toEqual(xs);
  });
});
