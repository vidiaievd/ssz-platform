import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, defaultRubric } from './model.js';
import type { Criterion } from './model.js';
import type { RubricSnapshot } from './verdict.js';
import {
  readRubricMarks,
  readRubricSnapshot,
  scoreRubric,
  snapshotRubric,
  toPercent,
} from './verdict.js';

function criterion(id: string, weight: 1 | 2): Criterion {
  return {
    id,
    name: id,
    desc: '',
    weight,
    levels: ['0', '1', '2', '3'],
    metric: null,
  };
}

function snapshot(criteria: Criterion[], passScore: number): RubricSnapshot {
  return snapshotRubric({ rubric: criteria, settings: { passScore } });
}

describe('snapshotRubric', () => {
  it('carries the descriptors the queue draws', () => {
    const taken = snapshot(defaultRubric(), 8);

    expect(taken.criteria).toHaveLength(4);
    expect(taken.passScore).toBe(8);
    for (const c of taken.criteria) {
      expect(c.levels).toHaveLength(4);
      expect(c.levels[3]).not.toBe('');
    }
  });

  it('leaves `metric` out — a suggestion belongs to the exercise, not the submission', () => {
    const taken = snapshot([criterion('a', 1)], 3);

    expect(taken.criteria[0]).not.toHaveProperty('metric');
  });

  it('takes the threshold from the exercise settings', () => {
    expect(snapshot(defaultRubric(), DEFAULT_SETTINGS.passScore).passScore).toBe(8);
  });
});

describe('scoreRubric', () => {
  const rubric = snapshot([criterion('a', 2), criterion('b', 1), criterion('c', 1), criterion('d', 1)], 8);

  it('weights the marks and normalizes the total to percent', () => {
    // 3×2 + 2 + 2 + 1 = 11 of 15.
    const outcome = scoreRubric(rubric, { a: 3, b: 2, c: 2, d: 1 });

    expect(outcome.points).toBe(11);
    expect(outcome.max).toBe(15);
    expect(outcome.percent).toBe(73);
    expect(outcome.complete).toBe(true);
    expect(outcome.missing).toEqual([]);
  });

  it('passes on the threshold in points, not in percent', () => {
    // 8 of 15 is 53% — below the SRS's 60, and still a pass: the threshold is points.
    const outcome = scoreRubric(rubric, { a: 2, b: 2, c: 1, d: 1 });

    expect(outcome.points).toBe(8);
    expect(outcome.percent).toBe(53);
    expect(outcome.passed).toBe(true);
  });

  it('fails one point under the threshold', () => {
    expect(scoreRubric(rubric, { a: 2, b: 1, c: 1, d: 1 }).passed).toBe(false);
  });

  it('reports unmarked criteria in snapshot order and scores them as nothing', () => {
    const outcome = scoreRubric(rubric, { b: 3 });

    expect(outcome.missing).toEqual(['a', 'c', 'd']);
    expect(outcome.complete).toBe(false);
    expect(outcome.points).toBe(3);
  });

  it('ignores marks for criteria the snapshot does not name', () => {
    // The live rubric grew a criterion after this submission was queued.
    const outcome = scoreRubric(snapshot([criterion('a', 1)], 3), { a: 3, later: 3 });

    expect(outcome.points).toBe(3);
    expect(outcome.max).toBe(3);
  });

  it('treats an out-of-range or non-numeric mark as unmarked, never as a score', () => {
    const outcome = scoreRubric(rubric, { a: 9, b: -1, c: '3' as unknown as number, d: 3 });

    expect(outcome.points).toBe(3);
    expect(outcome.missing).toEqual(['a', 'b', 'c']);
  });

  it('scores an empty rubric 100 rather than dividing by zero', () => {
    const outcome = scoreRubric({ criteria: [], passScore: 0 }, {});

    expect(outcome.max).toBe(0);
    expect(outcome.percent).toBe(100);
    expect(outcome.complete).toBe(true);
    expect(outcome.passed).toBe(true);
  });
});

describe('toPercent', () => {
  it('rounds', () => {
    expect(toPercent(11, 15)).toBe(73);
    expect(toPercent(7, 15)).toBe(47);
    expect(toPercent(15, 15)).toBe(100);
    expect(toPercent(0, 15)).toBe(0);
  });
});

describe('readRubricSnapshot', () => {
  it('round-trips a stored snapshot', () => {
    const taken = snapshot(defaultRubric(), 8);
    const read = readRubricSnapshot(JSON.parse(JSON.stringify(taken)));

    expect(read).toEqual(taken);
  });

  it('is null for an attempt that carries no rubric', () => {
    expect(readRubricSnapshot(null)).toBeNull();
    expect(readRubricSnapshot({})).toBeNull();
    expect(readRubricSnapshot({ criteria: [], passScore: 8 })).toBeNull();
    expect(readRubricSnapshot([{ id: 'a' }])).toBeNull();
  });

  it('fills in what a partial row is missing rather than dropping the criterion', () => {
    const read = readRubricSnapshot({ criteria: [{ id: 'a', weight: 2 }] });

    expect(read).toEqual({
      criteria: [{ id: 'a', name: '', desc: '', weight: 2, levels: ['', '', '', ''] }],
      passScore: 0,
    });
  });
});

describe('readRubricMarks', () => {
  it('keeps whole marks 0-3 and drops everything else', () => {
    expect(readRubricMarks({ a: 0, b: 3, c: 4, d: -1, e: null, f: '2', g: 1.4 })).toEqual({
      a: 0,
      b: 3,
      g: 1,
    });
  });

  it('is an empty set for anything that is not an object of marks', () => {
    expect(readRubricMarks(null)).toEqual({});
    expect(readRubricMarks([3])).toEqual({});
  });
});
