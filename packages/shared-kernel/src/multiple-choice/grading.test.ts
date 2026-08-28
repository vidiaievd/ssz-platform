// BEHAVIOR.md §"Student runner — decision table" and IMPLEMENTATION.md §"Grading payload".
// The dosing rules are the point of this file: what the verdict may say, and when.

import { describe, expect, it } from 'vitest';

import { eliminate, gradeAttempt, judge } from './grading.js';
import { content, option, question, settings } from './fixtures.test-support.js';

describe('judge — a correct pick', () => {
  it('closes the question and hands back the key and the rule', () => {
    const verdict = judge({ question: question(), settings: settings(), optionId: 'b', attempt: 1 });

    expect(verdict).toMatchObject({
      correct: true,
      closed: true,
      keyOptionId: 'b',
      why: 'Indirekte tale i fortid: presens blir preteritum.',
    });
  });

  it('withholds the rule when explainOnCorrect is off', () => {
    const verdict = judge({
      question: question(),
      settings: settings({ explainOnCorrect: false }),
      optionId: 'b',
      attempt: 1,
    });
    expect(verdict.why).toBeUndefined();
    expect(verdict.keyOptionId).toBe('b');
  });
});

describe('judge — a wrong pick with an attempt left', () => {
  const verdict = judge({ question: question(), settings: settings(), optionId: 'a', attempt: 1 });

  it('never names the key', () => {
    expect(verdict.correct).toBe(false);
    expect(verdict.closed).toBe(false);
    expect(verdict.keyOptionId).toBeUndefined();
    expect(verdict.why).toBeUndefined();
    expect(verdict.attemptsLeft).toBe(1);
  });

  it('hands back the picked option’s own rebuttal', () => {
    expect(verdict.optionWhy).toBe('Etter «sa» flyttes presens til preteritum.');
  });

  it('withholds the rebuttal when showWhyWrong is off', () => {
    const quiet = judge({
      question: question(),
      settings: settings({ showWhyWrong: false }),
      optionId: 'a',
      attempt: 1,
    });
    expect(quiet.optionWhy).toBeUndefined();
  });
});

describe('judge — closing a question', () => {
  it('retry: none closes on the first wrong pick', () => {
    const verdict = judge({
      question: question(),
      settings: settings({ retry: 'none' }),
      optionId: 'a',
      attempt: 1,
    });
    expect(verdict).toMatchObject({ closed: true, attemptsLeft: 0, keyOptionId: 'b' });
    expect(verdict.why).toBeDefined();
  });

  it('«Vis svaret» closes it even with an attempt left', () => {
    const verdict = judge({ question: question(), settings: settings(), optionId: 'a', attempt: 1, reveal: true });
    expect(verdict).toMatchObject({ closed: true, keyOptionId: 'b' });
    expect(verdict.attemptsLeft).toBe(1);
  });

  it('spends the budget on the second wrong pick under retry: one', () => {
    const verdict = judge({ question: question(), settings: settings(), optionId: 'a', attempt: 2 });
    expect(verdict).toMatchObject({ closed: true, attemptsLeft: 0, keyOptionId: 'b' });
  });

  it('unlimited means 99, so attempt 98 is still open', () => {
    const verdict = judge({
      question: question(),
      settings: settings({ retry: 'unlimited' }),
      optionId: 'a',
      attempt: 98,
    });
    expect(verdict.closed).toBe(false);
    expect(verdict.attemptsLeft).toBe(1);
  });
});

describe('the 50/50', () => {
  const four = question({
    options: [
      option({ id: 'a', text: 'er' }),
      option({ id: 'b', text: 'var', correct: true }),
      option({ id: 'c', text: 'har vært' }),
      option({ id: 'd', text: 'blir' }),
    ],
  });

  it('leaves the key and exactly one distractor standing', () => {
    for (const seed of [0, 1, 2, 3, 7, 42]) {
      const dimmed = eliminate(four, 'a', [], seed);
      const standing = four.options.filter((o) => !dimmed.includes(o.id));
      expect(standing.map((o) => o.id)).toContain('b');
      expect(standing).toHaveLength(2);
      expect(dimmed).toContain('a');
    }
  });

  it('does not fire when there is no distractor left to survive', () => {
    const two = question({
      options: [option({ id: 'a', text: 'Galt' }), option({ id: 'b', text: 'Riktig', correct: true })],
    });
    expect(eliminate(two, 'a', [], 1)).toEqual([]);
  });

  it('keeps what was already dimmed and adds to it', () => {
    const dimmed = eliminate(four, 'c', ['a'], 5);
    expect(dimmed).toEqual(expect.arrayContaining(['a', 'c']));
    expect(dimmed).not.toContain('b');
    expect(dimmed).not.toContain('d');
  });

  it('stops once the key and one distractor are all that is left', () => {
    // a and d already dimmed: striking out the pick as well would leave the key alone.
    expect(eliminate(four, 'c', ['a', 'd'], 5)).toEqual(['a', 'd']);
  });

  it('rides on the verdict only for a wrong pick that stays open', () => {
    const on = settings({ eliminate: true });
    expect(judge({ question: four, settings: on, optionId: 'a', attempt: 1 }).eliminated).toBeDefined();
    expect(judge({ question: four, settings: on, optionId: 'b', attempt: 1 }).eliminated).toBeUndefined();
    expect(
      judge({ question: four, settings: settings({ eliminate: true, retry: 'none' }), optionId: 'a', attempt: 1 })
        .eliminated,
    ).toBeUndefined();
  });
});

describe('gradeAttempt', () => {
  const ex = content({ questions: [question({ id: 'q1' }), question({ id: 'q2' }), question({ id: 'q3' })] });

  it('scores a first-attempt hit and not a second-attempt one', () => {
    const result = gradeAttempt(ex, [
      { questionId: 'q1', optionId: 'b', attempt: 1 },
      { questionId: 'q2', optionId: 'b', attempt: 2 },
      { questionId: 'q3', optionId: 'a', attempt: 1 },
    ]);

    expect(result.firstTry).toBe(1);
    expect(result.total).toBe(3);
    expect(result.score).toBe(33);
    expect(result.correct).toBe(false);
    expect(result.outcomes[1]).toMatchObject({ correct: true, firstTry: false });
  });

  it('counts an unanswered question as wrong', () => {
    const result = gradeAttempt(ex, [{ questionId: 'q1', optionId: 'b', attempt: 1 }]);
    expect(result.score).toBe(33);
    expect(result.outcomes[2]).toMatchObject({ optionId: null, correct: false });
  });

  it('is 100 and correct when every question is taken first try', () => {
    const result = gradeAttempt(ex, [
      { questionId: 'q1', optionId: 'b' },
      { questionId: 'q2', optionId: 'b' },
      { questionId: 'q3', optionId: 'b' },
    ]);
    expect(result).toMatchObject({ score: 100, correct: true });
  });

  it('ignores questions that are not answerable', () => {
    const half = content({ questions: [question({ id: 'q1' }), question({ id: 'q2', stem: '' })] });
    const result = gradeAttempt(half, [{ questionId: 'q1', optionId: 'b' }]);
    expect(result).toMatchObject({ total: 1, score: 100 });
  });
});
