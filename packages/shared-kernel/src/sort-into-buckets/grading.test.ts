// SPEC_api_contract §Grading and DECISIONS §5: one check of the board, first-check
// accuracy over all items, the key only once the board is closed.

import { describe, expect, it } from 'vitest';

import { setOverride, setUseNone, toggleAlso } from './edits.js';
import type { Placement } from './grading.js';
import { check } from './grading.js';
import { passMark, SB_NONE } from './model.js';
import { EI, EN, ET, exercise, settings } from './fixtures.test-support.js';

const RIGHT: Placement[] = [
  { itemId: 'i1', bucketId: EN.id },
  { itemId: 'i2', bucketId: EN.id },
  { itemId: 'i3', bucketId: EI.id },
  { itemId: 'i4', bucketId: EI.id },
  { itemId: 'i5', bucketId: ET.id },
  { itemId: 'i6', bucketId: ET.id },
];

const withWrong = (itemId: string, bucketId: string): Placement[] =>
  RIGHT.map((p) => (p.itemId === itemId ? { itemId, bucketId } : p));

describe('the score', () => {
  it('all right closes the board with 100', () => {
    const r = check({ ex: exercise(), placements: RIGHT, attempt: 1 });
    expect(r).toMatchObject({ correct: 6, total: 6, pct: 100, passed: true, closed: true });
  });

  it('AC-S12: an item never placed counts as wrong', () => {
    const r = check({ ex: exercise(), placements: RIGHT.slice(0, 3), attempt: 1 });
    expect(r.correct).toBe(3);
    expect(r.pct).toBe(50);
    expect(r.items.find((i) => i.itemKey === 'i6')).toMatchObject({ chosenBucketId: null, ok: false });
  });

  it('AC-S7: an item accepting two buckets is right in either', () => {
    const ex = toggleAlso(exercise(), 'i4', EN.id);
    const r = check({ ex, placements: withWrong('i4', EN.id), attempt: 1 });
    expect(r.items.find((i) => i.itemKey === 'i4')?.ok).toBe(true);
  });

  it('passes exactly at the threshold', () => {
    const ex = exercise({ settings: settings({ threshold: 50 }) });
    expect(check({ ex, placements: RIGHT.slice(0, 3), attempt: 1 }).passed).toBe(true);
    const strict = exercise({ settings: settings({ threshold: 51 }) });
    expect(check({ ex: strict, placements: RIGHT.slice(0, 3), attempt: 1 }).passed).toBe(false);
  });

  it('AC-D2: the pass mark in items follows the threshold', () => {
    expect(passMark(settings({ threshold: 70 }), 9)).toBe(7);
    expect(passMark(settings({ threshold: 100 }), 9)).toBe(9);
  });

  it('a later check changes what is shown, never the score', () => {
    const ex = exercise();
    const first = check({ ex, placements: withWrong('i1', EI.id), attempt: 1 });
    expect(first.pct).toBe(83);

    const second = check({
      ex,
      placements: RIGHT,
      attempt: 2,
      locked: first.locked,
      firstBuckets: first.firstBuckets,
    });
    expect(second.correctNow).toBe(6);
    expect(second.correct).toBe(5);
    expect(second.pct).toBe(83);
    expect(second.closed).toBe(true);
  });

  it('an item placed for the first time on a re-check still counts from the first check', () => {
    const ex = exercise();
    const first = check({ ex, placements: RIGHT.slice(0, 5), attempt: 1 });
    expect(first.firstBuckets['i6']).toBeNull();
    const second = check({ ex, placements: RIGHT, attempt: 2, firstBuckets: first.firstBuckets });
    expect(second.items.find((i) => i.itemKey === 'i6')).toMatchObject({ ok: true, firstOk: false });
  });
});

describe('locking and the budget', () => {
  it('AC-S4: right tiles lock and stay right whatever the client resends', () => {
    const ex = exercise();
    const first = check({ ex, placements: withWrong('i1', EI.id), attempt: 1 });
    expect(first.locked).toEqual(['i2', 'i3', 'i4', 'i5', 'i6']);

    // The client moves a locked tile; the server keeps it where it was right.
    const moved = withWrong('i2', ET.id);
    const second = check({ ex, placements: moved, attempt: 2, locked: first.locked });
    expect(second.items.find((i) => i.itemKey === 'i2')).toMatchObject({
      ok: true,
      chosenBucketId: EN.id,
    });
  });

  it('AC-S6: the board closes when the checks run out', () => {
    const ex = exercise({ settings: settings({ attempts: 2 }) });
    const first = check({ ex, placements: withWrong('i1', EI.id), attempt: 1 });
    expect(first).toMatchObject({ checksLeft: 1, closed: false });
    const second = check({ ex, placements: withWrong('i1', ET.id), attempt: 2 });
    expect(second).toMatchObject({ checksLeft: 0, closed: true });
  });

  it('unlimited checks never close a board that is still wrong', () => {
    const r = check({ ex: exercise(), placements: withWrong('i1', EI.id), attempt: 40 });
    expect(r).toMatchObject({ checksLeft: null, closed: false });
  });
});

describe('what a check tells the student', () => {
  it('AC-S4: a wrong tile carries the explanation for the bucket it is in', () => {
    const ex = setOverride(exercise(), 'i1', EI.id, 'Bil er hankjønn: bilen.');
    const r = check({ ex, placements: withWrong('i1', EI.id), attempt: 1 });
    expect(r.items.find((i) => i.itemKey === 'i1')?.explanation).toBe('Bil er hankjønn: bilen.');

    const def = check({ ex, placements: withWrong('i1', ET.id), attempt: 1 });
    expect(def.items.find((i) => i.itemKey === 'i1')?.explanation).toBe('i1 — default');
  });

  it('while a retry is left, no key, no why, no rules', () => {
    const r = check({ ex: exercise(), placements: withWrong('i1', EI.id), attempt: 1 });
    for (const outcome of r.items) {
      expect(outcome).not.toHaveProperty('correctBucketId');
      expect(outcome).not.toHaveProperty('why');
    }
    expect(r.rules).toEqual([]);
  });

  it('AC-S8: reveal shows every primary bucket, each why and each rule, and fails', () => {
    const ex = toggleAlso(exercise(), 'i4', EN.id);
    const r = check({ ex, placements: RIGHT, attempt: 1, reveal: true });
    expect(r.closed).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.items.find((i) => i.itemKey === 'i4')).toMatchObject({
      correctBucketId: EI.id,
      why: 'bok — why',
    });
    expect(r.rules.map((x) => x.bucketId)).toEqual([EN.id, EI.id, ET.id]);
  });

  it('a closed board under revealKey:false shows no key', () => {
    const ex = exercise({ settings: settings({ revealKey: false }) });
    const r = check({ ex, placements: RIGHT, attempt: 1 });
    expect(r.closed).toBe(true);
    expect(r.items[0]).not.toHaveProperty('correctBucketId');
    expect(r.rules).toEqual([]);
  });

  it('drops a placement into a zone the board does not have', () => {
    const r = check({ ex: exercise(), placements: withWrong('i1', SB_NONE), attempt: 1 });
    expect(r.items.find((i) => i.itemKey === 'i1')?.chosenBucketId).toBeNull();
    const withNone = setUseNone(exercise(), true);
    const ok = check({ ex: withNone, placements: withWrong('i1', SB_NONE), attempt: 1 });
    expect(ok.items.find((i) => i.itemKey === 'i1')?.chosenBucketId).toBe(SB_NONE);
  });
});
