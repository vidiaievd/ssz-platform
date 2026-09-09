// Plan 53 §3.2 and §3.9 — the split across the two columns, the coercion of what comes
// back out of them, and the one test that tells the two live document shapes apart.

import { describe, expect, it } from 'vitest';

import {
  fromPersisted,
  isMultipleChoiceDocument,
  readContent,
  toContent,
  toExpectedAnswers,
} from './persistence.js';
import { DEFAULT_SETTINGS } from './model.js';
import { content, option, question } from './fixtures.test-support.js';

describe('the split', () => {
  const ex = content();

  it('keeps the key out of the content column entirely', () => {
    const serialised = JSON.stringify(toContent(ex));
    expect(serialised).not.toContain('correct');
    expect(serialised).not.toContain('Indirekte tale i fortid');
    expect(serialised).not.toContain('Etter «sa»');
  });

  it('persists empty options as authored', () => {
    const half = content({
      questions: [question({ options: [option({ id: 'a', text: 'var', correct: true }), option({ id: 'b' })] })],
    });
    expect(toContent(half).questions[0]!.options).toHaveLength(2);
  });

  it('puts the key, the rule and the rebuttals in the answer column, keyed by question id', () => {
    expect(toExpectedAnswers(ex).questions['q1']).toEqual({
      correctOptionId: 'b',
      why: 'Indirekte tale i fortid: presens blir preteritum.',
      options: { a: 'Etter «sa» flyttes presens til preteritum.' },
    });
  });

  it('round-trips', () => {
    const back = fromPersisted(toContent(ex), toExpectedAnswers(ex));
    expect(back).toEqual(ex);
  });
});

describe('coercion', () => {
  it('does not throw on junk and fills the defaults', () => {
    expect(readContent(null)).toEqual({ title: '', instruction: '', questions: [], settings: DEFAULT_SETTINGS });
    expect(readContent({ questions: 'nope', settings: 7 }).questions).toEqual([]);
  });

  it('drops an unknown kind and an unknown retry policy back to the default', () => {
    const doc = readContent({
      questions: [{ id: 'q1', kind: 'telepathy', stem: 'x', options: [{ id: 'a', text: 'y' }] }],
      settings: { retry: 'forever', layout: 'spiral' },
    });
    expect(doc.questions[0]!.kind).toBe('grammar');
    expect(doc.settings.retry).toBe('one');
    expect(doc.settings.layout).toBe('list');
  });

  it('reads a question whose key is missing from the answer column', () => {
    const back = fromPersisted(toContent(content()), {});
    expect(back.questions[0]!.options.some((o) => o.correct)).toBe(false);
    expect(back.questions[0]!.why).toBe('');
  });
});

describe('isMultipleChoiceDocument', () => {
  it('is true for the new form and false for the old one', () => {
    expect(isMultipleChoiceDocument(toContent(content()))).toBe(true);
    expect(isMultipleChoiceDocument({ questions: [] })).toBe(true);
    expect(
      isMultipleChoiceDocument({ question: 'Han sa at han ___ syk.', options: [{ id: 'a', text: 'er' }] }),
    ).toBe(false);
    expect(isMultipleChoiceDocument(null)).toBe(false);
  });
});
