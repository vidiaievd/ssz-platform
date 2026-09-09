// Plan 55 §3.9 — the three rules the profile is worthless without.

import { describe, expect, it } from 'vitest';

import { cellsFor } from './model.js';
import { evidenceWeight, succeededAt } from './weight.js';
import { foldAttempt } from './ewma.js';
import { weakestCells } from './verdict.js';
import type { MasteryObservation } from './model.js';

const AT = new Date('2026-09-02T10:00:00Z');

const observation = (over: Partial<MasteryObservation> = {}): MasteryObservation => ({
  succeeded: true,
  weight: 1,
  stability: null,
  secondsPerItem: null,
  at: AT,
  ...over,
});

describe('cellsFor', () => {
  it('puts an attempt in every cell it is evidence for', () => {
    expect(cellsFor(['reading', 'written'], ['grammar'])).toEqual([
      { skill: 'reading', focus: 'grammar' },
      { skill: 'written', focus: 'grammar' },
    ]);
  });

  it('buckets a missing axis under unknown rather than dropping the attempt', () => {
    // §3.10, and the state of the catalogue: no ContentRelation rows are seeded, so
    // nearly every attempt today has no derivable focus. Dropping them would leave the
    // profile empty and silent about why.
    expect(cellsFor(['reading'], [])).toEqual([{ skill: 'reading', focus: 'unknown' }]);
    expect(cellsFor([], [])).toEqual([{ skill: 'unknown', focus: 'unknown' }]);
  });
});

describe('evidenceWeight', () => {
  it('weighs a typed answer above one picked from five', () => {
    const free = evidenceWeight({
      succeeded: true,
      answerForm: { mode: 'free', bankSize: null, wordsConsumed: false },
    });
    const bank = evidenceWeight({
      succeeded: true,
      answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: false },
    });
    expect(free).toBe(1);
    expect(bank).toBeCloseTo(2 / 3);
  });

  it('runs the other way on a failure — the asymmetry of plan 36 §B.1', () => {
    // Getting it wrong with five words on screen is damning; getting it wrong while
    // typing may be a doubled consonant.
    const free = evidenceWeight({
      succeeded: false,
      answerForm: { mode: 'free', bankSize: null, wordsConsumed: false },
    });
    const bank = evidenceWeight({
      succeeded: false,
      answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: false },
    });
    expect(bank).toBe(1);
    expect(free).toBeCloseTo(2 / 3);
  });

  it('counts an undescribable attempt as it is, not as nothing', () => {
    expect(evidenceWeight({ succeeded: true })).toBe(1);
    expect(evidenceWeight({ succeeded: false })).toBe(1);
  });

  it('splits success from failure where FSRS does', () => {
    expect(succeededAt('AGAIN')).toBe(false);
    expect(succeededAt('HARD')).toBe(true);
  });
});

describe('foldAttempt', () => {
  const options = { alpha: 0.2 };

  it('seeds on the first attempt instead of climbing out of zero', () => {
    const cell = foldAttempt(null, observation(), options);
    expect(cell.successRateEwma).toBe(1);
    expect(cell.attempts).toBe(1);
    expect(cell.weightedSample).toBe(1);
    expect(cell.lastAttemptAt).toBe(AT);
  });

  it('counts a thin attempt and a strong one differently in the sample', () => {
    // The pair the confidence threshold reads: both happened, only one proved much.
    const bank = foldAttempt(null, observation({ weight: 1 / 3 }), options);
    const free = foldAttempt(null, observation({ weight: 1 }), options);
    expect(bank.attempts).toBe(free.attempts);
    expect(bank.weightedSample).toBeLessThan(free.weightedSample);
  });

  it('lets a strong attempt move the average further than a weak one', () => {
    const previous = foldAttempt(null, observation({ succeeded: true }), options);
    const weak = foldAttempt(previous, observation({ succeeded: false, weight: 1 / 3 }), options);
    const strong = foldAttempt(previous, observation({ succeeded: false, weight: 1 }), options);
    expect(strong.successRateEwma).toBeLessThan(weak.successRateEwma);
  });

  it('forgets: a run of failures pulls a perfect record down within a few attempts', () => {
    // Rule 1 — weakness has to expire, and so does strength. A lifetime mean would need
    // as many failures as there were successes to say the same thing.
    let cell = foldAttempt(null, observation({ succeeded: true }), options);
    for (let i = 0; i < 9; i += 1) cell = foldAttempt(cell, observation({ succeeded: true }), options);
    expect(cell.successRateEwma).toBe(1);

    for (let i = 0; i < 5; i += 1) cell = foldAttempt(cell, observation({ succeeded: false }), options);
    expect(cell.successRateEwma).toBeLessThan(0.7);
    expect(cell.attempts).toBe(15);
  });

  it('keeps the last stability when an attempt reports none', () => {
    const first = foldAttempt(null, observation({ stability: 8 }), options);
    const second = foldAttempt(first, observation({ stability: null }), options);
    expect(second.meanStability).toBe(8);
  });

  it('blends stability and time at the plain rate — they are measured, not inferred', () => {
    const first = foldAttempt(null, observation({ stability: 10, secondsPerItem: 30 }), options);
    const second = foldAttempt(
      first,
      observation({ stability: 20, secondsPerItem: 10, weight: 1 / 3 }),
      options,
    );
    expect(second.meanStability).toBeCloseTo(12);
    expect(second.medianSecondsPerItem).toBeCloseTo(26);
  });

  it('counts a weightless attempt without letting it move anything', () => {
    const previous = foldAttempt(null, observation({ succeeded: true }), options);
    const next = foldAttempt(previous, observation({ succeeded: false, weight: 0 }), options);
    expect(next.successRateEwma).toBe(previous.successRateEwma);
    expect(next.attempts).toBe(2);
    expect(next.weightedSample).toBe(previous.weightedSample);
  });
});

describe('weakestCells', () => {
  const cell = (
    skill: 'reading' | 'listening' | 'written',
    focus: 'grammar' | 'vocabulary',
    successRateEwma: number,
    weightedSample: number,
    attempts = Math.ceil(weightedSample),
  ) => ({
    skill,
    focus,
    state: {
      successRateEwma,
      meanStability: null,
      medianSecondsPerItem: null,
      attempts,
      weightedSample,
      lastAttemptAt: AT,
    },
  });

  it('says "not enough data" instead of naming a weakness on three attempts', () => {
    // Rule 3, and the whole reason the two lists are separate: a verdict is acted on.
    const result = weakestCells([cell('listening', 'grammar', 0.1, 2)], { minWeightedSample: 5 });
    expect(result.weakest).toEqual([]);
    expect(result.insufficient).toHaveLength(1);
    expect(result.insufficient[0]).toMatchObject({
      skill: 'listening',
      status: 'insufficient_data',
      shortfall: 3,
    });
  });

  it('orders the verdicts weakest first', () => {
    const result = weakestCells(
      [
        cell('reading', 'grammar', 0.9, 10),
        cell('listening', 'vocabulary', 0.3, 10),
        cell('written', 'grammar', 0.6, 10),
      ],
      { minWeightedSample: 5 },
    );
    expect(result.weakest.map((c) => c.skill)).toEqual(['listening', 'written', 'reading']);
  });

  it('breaks a tie on the better-evidenced cell', () => {
    const result = weakestCells(
      [cell('reading', 'grammar', 0.4, 6), cell('written', 'grammar', 0.4, 20)],
      { minWeightedSample: 5 },
    );
    expect(result.weakest.map((c) => c.skill)).toEqual(['written', 'reading']);
  });

  it('reads the threshold off the weighted sample, not the attempt count', () => {
    // Twenty picks out of four options are not twenty answers — that is the whole point
    // of keeping the two numbers apart.
    const thin = cell('reading', 'grammar', 0.2, 20 / 3, 20);
    const result = weakestCells([thin], { minWeightedSample: 10 });
    expect(result.weakest).toEqual([]);
    expect(result.insufficient[0]?.attempts).toBe(20);
  });

  it('limits the verdicts without hiding the uncertain cells', () => {
    const result = weakestCells(
      [
        cell('reading', 'grammar', 0.2, 10),
        cell('written', 'grammar', 0.3, 10),
        cell('listening', 'vocabulary', 0.1, 1),
      ],
      { minWeightedSample: 5, limit: 1 },
    );
    expect(result.weakest).toHaveLength(1);
    expect(result.insufficient).toHaveLength(1);
  });
});
