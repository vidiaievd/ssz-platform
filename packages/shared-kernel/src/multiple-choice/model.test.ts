// README §"Data model" — defaults, factories and the attempt budget.

import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, duplicateQuestion, emptyContent, kindConfig, maxAttempts, newQuestion } from './model.js';
import { question, settings } from './fixtures.test-support.js';

describe('defaults', () => {
  it('matches MC_DEFAULT_SETTINGS from the handoff', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      letters: true,
      layout: 'list',
      shuffle: true,
      shuffleQuestions: false,
      instant: false,
      retry: 'one',
      eliminate: false,
      showWhyWrong: true,
      explainOnCorrect: true,
      progress: true,
    });
  });

  it('starts a new question with three empty options and no key', () => {
    const q = newQuestion();
    expect(q.kind).toBe('grammar');
    expect(q.options).toHaveLength(3);
    expect(q.options.every((o) => o.text === '' && !o.correct)).toBe(true);
  });

  it('leaves the instruction empty rather than seeding Norwegian (plan 53 §3.6)', () => {
    expect(emptyContent().instruction).toBe('');
  });
});

describe('maxAttempts', () => {
  it('is 1, 2 and 99', () => {
    expect(maxAttempts(settings({ retry: 'none' }))).toBe(1);
    expect(maxAttempts(settings({ retry: 'one' }))).toBe(2);
    expect(maxAttempts(settings({ retry: 'unlimited' }))).toBe(99);
  });
});

describe('duplicateQuestion', () => {
  it('mints new ids for the question and every option', () => {
    const source = question();
    const copy = duplicateQuestion(source);

    expect(copy.id).not.toBe(source.id);
    expect(copy.options.map((o) => o.id)).not.toEqual(source.options.map((o) => o.id));
    expect(new Set(copy.options.map((o) => o.id)).size).toBe(source.options.length);
    expect(copy.options.map((o) => o.text)).toEqual(source.options.map((o) => o.text));
    expect(copy.options.filter((o) => o.correct)).toHaveLength(1);
  });
});

describe('kindConfig', () => {
  it('expects a passage only for reading, and hides it only for listening', () => {
    expect(kindConfig('reading')).toMatchObject({ needsPassage: true, showsPassage: true });
    expect(kindConfig('listening')).toMatchObject({ needsPassage: false, showsPassage: false });
    expect(kindConfig('grammar')).toMatchObject({ needsPassage: false, showsPassage: true });
  });
});
