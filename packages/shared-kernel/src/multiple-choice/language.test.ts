// Plan 53 §3.6 — the two language-bound audit checks, and comparing options across
// languages the handoff's `toLowerCase()` gets wrong.

import { describe, expect, it } from 'vitest';

import { normalizeText, packFor } from './language.js';

describe('packFor', () => {
  it('answers for Norwegian, English, Russian, Ukrainian and German', () => {
    for (const code of ['nb', 'nn', 'no', 'en', 'ru', 'uk', 'de']) {
      expect(packFor(code)).not.toBeNull();
    }
  });

  it('accepts a regional tag', () => {
    expect(packFor('nb-NO')).toBe(packFor('nb'));
  });

  it('stays silent for a language the platform has no pack for', () => {
    expect(packFor('pl')).toBeNull();
    expect(packFor('')).toBeNull();
    expect(packFor(undefined)).toBeNull();
  });
});

describe('absolutes', () => {
  it('matches whole words only', () => {
    const nb = packFor('nb')!;
    expect(nb.absolutes.test('Man må alltid bruke lys.')).toBe(true);
    expect(nb.absolutes.test('kunnskap')).toBe(false);
  });

  it('matches Cyrillic, where a \\b-anchored pattern would match nothing', () => {
    const ru = packFor('ru')!;
    const uk = packFor('uk')!;
    expect(ru.absolutes.test('Это всегда так.')).toBe(true);
    expect(ru.absolutes.test('всегдашний')).toBe(false);
    expect(uk.absolutes.test('Це ніколи не так.')).toBe(true);
  });
});

describe('allOfThese', () => {
  it('catches the option that tests logic instead of the language', () => {
    expect(packFor('nb')!.allOfThese.test('Alle av svarene')).toBe(true);
    expect(packFor('en')!.allOfThese.test('All of the above')).toBe(true);
    expect(packFor('nb')!.allOfThese.test('Alle barna leker ute')).toBe(false);
  });
});

describe('normalizeText', () => {
  it('collapses whitespace and case', () => {
    expect(normalizeText('  Var   syk ')).toBe('var syk');
  });

  it('composes decomposed input, so two keyboards compare equal', () => {
    const composed = 'm\u00e5'; // "må" with a precomposed å
    const decomposed = 'ma\u030a'; // the same word typed as a + combining ring
    expect(composed).not.toBe(decomposed);
    expect(normalizeText(decomposed)).toBe(normalizeText(composed));
  });

  it('lowercases by the locale, which is where toLowerCase() is wrong', () => {
    // Turkish has two i's. Under the invariant mapping both spellings collapse onto the
    // same string and the audit would call them duplicates; under `tr` they stay apart.
    expect(normalizeText('İstanbul', 'tr')).toBe('istanbul');
    expect(normalizeText('Istanbul', 'tr')).toBe('ıstanbul');
    expect(normalizeText('İstanbul', 'tr')).not.toBe(normalizeText('Istanbul', 'tr'));
  });
});
