// The split between the two columns, and the coercion that has to survive whatever is
// already in the database.

import { describe, expect, it } from 'vitest';

import type { Question, ShortAnswerContent } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import {
  fromPersisted,
  isShortAnswerDocument,
  readAnswers,
  readContent,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    kind: 'reading',
    passage: 'Fra 1. januar må alle som sykler i mørket ha lys foran og bak.',
    prompt: 'Hva er nytt fra 1. januar?',
    // The key deliberately words things the passage does not, so that the "no key in
    // the content column" assertion below cannot pass by accident on shared wording.
    model: 'Alle syklister må ha lykt foran og bak i mørket.',
    elements: [{ id: 'e1', label: 'Kravet', anchors: ['lykt foran'], required: true }],
    why: 'Regelen står i første setning.',
    ...overrides,
  };
}

function document(overrides: Partial<ShortAnswerContent> = {}): ShortAnswerContent {
  return {
    title: 'Sykkelregler',
    instruction: 'Svar med egne ord.',
    questions: [question()],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  };
}

describe('the split', () => {
  it('keeps every part of the key out of the content column', () => {
    // The load-bearing test of this module: a serialised `content` must not contain the
    // anchors, the model answer or the explanation anywhere, at any depth.
    const serialised = JSON.stringify(toContent(document()));
    expect(serialised).not.toContain('lykt foran');
    expect(serialised).not.toContain('Alle syklister');
    expect(serialised).not.toContain('Regelen står');
    expect(serialised).not.toContain('Kravet');
  });

  it('keeps the question itself in the content column', () => {
    const content = toContent(document());
    expect(content.questions).toEqual([
      {
        id: 'q1',
        kind: 'reading',
        passage: 'Fra 1. januar må alle som sykler i mørket ha lys foran og bak.',
        prompt: 'Hva er nytt fra 1. januar?',
      },
    ]);
    expect(content.title).toBe('Sykkelregler');
    expect(content.instruction).toBe('Svar med egne ord.');
  });

  it('keys the answers by question id, not by position', () => {
    const ex = document({ questions: [question({ id: 'b' }), question({ id: 'a', model: 'Et annet svar.' })] });
    const answers = toExpectedAnswers(ex);
    expect(Object.keys(answers.questions).sort()).toEqual(['a', 'b']);
    expect(answers.questions['a']?.model).toBe('Et annet svar.');
  });

  it('round-trips a document through both columns', () => {
    const ex = document();
    expect(fromPersisted(toContent(ex), toExpectedAnswers(ex))).toEqual(ex);
  });

  it('reassembles by id after the questions are reordered', () => {
    const ex = document({
      questions: [question({ id: 'q1' }), question({ id: 'q2', model: 'Svar to.', why: 'Fordi to.' })],
    });
    const answers = toExpectedAnswers(ex);
    const content = toContent(ex);
    content.questions.reverse();

    const back = fromPersisted(content, answers);
    expect(back.questions.map((q) => q.id)).toEqual(['q2', 'q1']);
    expect(back.questions[0]?.model).toBe('Svar to.');
  });
});

describe('fromPersisted with a key that has gone missing', () => {
  it('yields an empty key rather than throwing', () => {
    // Exactly what content-service hands the runner: `content` intact, `expected_answers`
    // nulled out. It must read as a document with no key, not as a crash.
    const back = fromPersisted(toContent(document()), null);
    expect(back.questions[0]).toMatchObject({ prompt: 'Hva er nytt fra 1. januar?', elements: [], model: '', why: '' });
  });
});

describe('isShortAnswerDocument', () => {
  it('recognises the new form, even while it holds no questions', () => {
    expect(isShortAnswerDocument({ questions: [] })).toBe(true);
    expect(isShortAnswerDocument(toContent(document()))).toBe(true);
  });

  it('rejects the old single-question form', () => {
    // The 144 documents plan 51 §8 Q1 leaves in place. Every dispatching surface asks
    // this question; getting it wrong sends an old document to the new grader.
    expect(isShortAnswerDocument({ question: 'Hvorfor trenger de egenkapital?', context: 'Tekst 3A.' })).toBe(false);
  });

  it('rejects nonsense without throwing', () => {
    expect(isShortAnswerDocument(null)).toBe(false);
    expect(isShortAnswerDocument('questions')).toBe(false);
    expect(isShortAnswerDocument({ questions: 'four' })).toBe(false);
  });
});

describe('readContent coercion', () => {
  it('fills defaults for a missing settings object', () => {
    expect(readContent({ questions: [] }).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back on an unknown kind', () => {
    expect(readContent({ questions: [{ id: 'q', kind: 'video' }] }).questions[0]?.kind).toBe('reading');
  });

  it('drops a non-array questions field', () => {
    expect(readContent({ questions: { q1: {} } }).questions).toEqual([]);
  });

  it('clamps passN into the range the builder offers', () => {
    // A stored 9 would make every question unpassable without any surface saying why.
    expect(readContent({ settings: { passN: 9 } }).settings.passN).toBe(3);
    expect(readContent({ settings: { passN: 0 } }).settings.passN).toBe(1);
  });

  it('refuses a negative minWords', () => {
    expect(readContent({ settings: { minWords: -4 } }).settings.minWords).toBe(0);
  });

  it('falls back on an unknown policy value', () => {
    const settings = readContent({ settings: { showModel: 'sometimes', teacherReview: 'maybe', passRule: 'most' } })
      .settings;
    expect(settings.showModel).toBe(DEFAULT_SETTINGS.showModel);
    expect(settings.teacherReview).toBe(DEFAULT_SETTINGS.teacherReview);
    expect(settings.passRule).toBe(DEFAULT_SETTINGS.passRule);
  });
});

describe('readAnswers coercion', () => {
  it('drops non-string anchors', () => {
    const answers = readAnswers({ questions: { q1: { elements: [{ id: 'e1', label: 'x', anchors: ['ok', 7, null] }] } } });
    expect(answers.questions['q1']?.elements[0]?.anchors).toEqual(['ok']);
  });

  it('defaults a missing required flag to true', () => {
    const answers = readAnswers({ questions: { q1: { elements: [{ id: 'e1', label: 'x', anchors: [] }] } } });
    expect(answers.questions['q1']?.elements[0]?.required).toBe(true);
  });

  it('returns nothing at all for a null column', () => {
    expect(readAnswers(null)).toEqual({ questions: {} });
  });
});
