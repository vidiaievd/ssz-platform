// README §"Derived values" — what can be shown, and the one-key rule.

import { describe, expect, it } from 'vitest';

import { answerableQuestions, correctOption, filledOptions, isAnswerable, setKey } from './derive.js';
import { content, option, question } from './fixtures.test-support.js';

describe('setKey', () => {
  it('clears every other key in the question', () => {
    const q = question({
      options: [option({ id: 'a', text: 'er', correct: true }), option({ id: 'b', text: 'var' })],
    });

    const updated = setKey(q, 'b');

    expect(updated.options.filter((o) => o.correct).map((o) => o.id)).toEqual(['b']);
    expect(correctOption(updated)?.id).toBe('b');
  });
});

describe('isAnswerable', () => {
  it('needs a stem, two written options and a written key', () => {
    expect(isAnswerable(question())).toBe(true);
    expect(isAnswerable(question({ stem: '  ' }))).toBe(false);
    expect(
      isAnswerable(question({ options: [option({ id: 'a', text: 'er', correct: true }), option({ id: 'b' })] })),
    ).toBe(false);
  });

  it('rejects a question whose only key is empty', () => {
    const q = question({
      options: [
        option({ id: 'a', text: 'er' }),
        option({ id: 'b', text: 'var' }),
        option({ id: 'c', correct: true }),
      ],
    });
    expect(isAnswerable(q)).toBe(false);
  });
});

describe('filledOptions', () => {
  it('drops the blanks', () => {
    const q = question({
      options: [option({ id: 'a', text: 'er', correct: true }), option({ id: 'b', text: '  ' })],
    });
    expect(filledOptions(q).map((o) => o.id)).toEqual(['a']);
  });
});

describe('answerableQuestions', () => {
  it('keeps author order and skips the unfinished', () => {
    const ex = content({ questions: [question({ id: 'q1' }), question({ id: 'q2', stem: '' })] });
    expect(answerableQuestions(ex).map((q) => q.id)).toEqual(['q1']);
  });
});
