// Plan 58 §Фаза 0 — the rule the whole pack rests on: a measured zero and an unmeasured
// cell are different answers, and nothing here may collapse them.

import { describe, expect, it } from 'vitest';

import { CELL_STATES, cellStateOf, isMeasured } from './model.js';
import { bandOf, distributionOf, pct, percentileOf } from './scale.js';
import type { CellStateInput } from './model.js';

const measured = (over: Partial<CellStateInput> = {}): CellStateInput => ({
  attempts: 12,
  sample: 12,
  minSample: 8,
  value: 0.7,
  ...over,
});

describe('cellStateOf', () => {
  it('tells a measured zero from a cell nobody has attempted', () => {
    const zero = cellStateOf(measured({ value: 0 }));
    const untouched = cellStateOf(measured({ attempts: 0, sample: 0, value: null }));

    expect(zero).toBe('low');
    expect(untouched).toBe('notStarted');
    expect(zero).not.toBe(untouched);
  });

  it('refuses a verdict under the sample threshold', () => {
    expect(cellStateOf(measured({ attempts: 4, sample: 3 }))).toBe('insufficient');
    // The threshold is the caller's, never a constant here.
    expect(cellStateOf(measured({ attempts: 4, sample: 3, minSample: 3 }))).toBe('ok');
  });

  it('never answers "ok" without a value', () => {
    expect(cellStateOf(measured({ value: null }))).toBe('insufficient');
  });

  it('separates "the course does not teach this" from "the learner has not started"', () => {
    expect(cellStateOf(measured({ items: 0, attempts: 0, sample: 0, value: null }))).toBe(
      'noContent',
    );
    expect(cellStateOf(measured({ items: 9, attempts: 0, sample: 0, value: null }))).toBe(
      'notStarted',
    );
  });

  it('applies the priority rule in order, highest first', () => {
    // Everything is wrong with this cell at once; the teacher's first question wins.
    const everything = measured({
      delivered: false,
      linked: false,
      items: 0,
      attempts: 0,
      sample: 0,
      value: null,
    });
    expect(cellStateOf(everything)).toBe('notDelivered');
    expect(cellStateOf({ ...everything, delivered: true })).toBe('unlinked');
    expect(cellStateOf({ ...everything, delivered: true, linked: true })).toBe('noContent');
    expect(cellStateOf({ ...everything, delivered: true, linked: true, items: 5 })).toBe(
      'notStarted',
    );
  });

  it('asks nothing about delivery where nothing is scheduled', () => {
    // A learner's skill×focus cell has no plan behind it: `undefined` is not `false`.
    expect(cellStateOf(measured({ delivered: undefined, linked: undefined }))).toBe('ok');
  });

  it('draws the acting line at the caller\'s threshold', () => {
    expect(cellStateOf(measured({ value: 0.39 }))).toBe('low');
    expect(cellStateOf(measured({ value: 0.4 }))).toBe('ok');
    expect(cellStateOf(measured({ value: 0.5, lowThreshold: 0.6 }))).toBe('low');
  });
});

describe('isMeasured', () => {
  it('counts a bad number as a number', () => {
    expect(isMeasured('low')).toBe(true);
    expect(isMeasured('ok')).toBe(true);
  });

  it('counts every kind of emptiness as no number at all', () => {
    for (const state of CELL_STATES) {
      if (state === 'ok' || state === 'low') continue;
      expect(isMeasured(state)).toBe(false);
    }
  });
});

describe('pct', () => {
  it('keeps "we do not know" out of the percent scale', () => {
    expect(pct(null)).toBeNull();
    expect(pct(0)).toBe(0);
  });

  it('rounds to whole percent, once, for everybody', () => {
    expect(pct(0.666)).toBe(67);
    expect(pct(0.005)).toBe(1);
    expect(pct(1.4)).toBe(100);
    expect(pct(-0.2)).toBe(0);
  });
});

describe('distributionOf', () => {
  it('answers null for a group nobody measured', () => {
    expect(distributionOf([])).toBeNull();
  });

  it('reports the median with the band around it', () => {
    const d = distributionOf([0.2, 0.4, 0.6, 0.8]);
    expect(d).not.toBeNull();
    expect(d?.median).toBeCloseTo(0.5);
    expect(d?.p25).toBeCloseTo(0.35);
    expect(d?.p75).toBeCloseTo(0.65);
    expect(d?.n).toBe(4);
  });

  it('survives a group of one', () => {
    expect(distributionOf([0.3])).toEqual({ median: 0.3, p25: 0.3, p75: 0.3, n: 1 });
  });
});

describe('percentileOf', () => {
  it('says nothing about a learner with no peers', () => {
    expect(percentileOf(0.5, [])).toBeNull();
  });

  it('counts the share of the group below the learner', () => {
    expect(percentileOf(0.5, [0.1, 0.2, 0.9, 0.95])).toBe(50);
  });

  it('turns into a band wide enough to survive one homework', () => {
    expect(bandOf(10)).toBe('below');
    expect(bandOf(50)).toBe('middle');
    expect(bandOf(90)).toBe('above');
  });
});
