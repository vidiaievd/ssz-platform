// Plan 53 §3.6, carried: the audit's language-bound rules follow the course, not the
// handoff, and stay silent when they cannot.

import { describe, expect, it } from 'vitest';

import { countNegations, normalizeText, packFor } from './language.js';

describe('packFor', () => {
  it('answers for the four platform languages', () => {
    expect(packFor('nb')?.langs).toContain('nb');
    expect(packFor('en')?.langs).toContain('en');
    expect(packFor('ru')?.langs).toContain('ru');
    expect(packFor('uk')?.langs).toContain('uk');
  });

  it('reads a regional tag as its base language', () => {
    expect(packFor('nb-NO')).not.toBeNull();
    expect(packFor('en_GB')).not.toBeNull();
  });

  it('is null for an unknown language and for none at all', () => {
    expect(packFor('sw')).toBeNull();
    expect(packFor(undefined)).toBeNull();
  });
});

describe('absolutes', () => {
  it('matches a whole word only', () => {
    const nb = packFor('nb')!;
    expect(nb.absolutes.test('Alle syklister har lys.')).toBe(true);
    expect(nb.absolutes.test('Allergi er vanlig.')).toBe(false);
  });

  it('finds Cyrillic words, which a \\b-anchored pattern would not', () => {
    const ru = packFor('ru')!;
    expect(ru.absolutes.test('Он всегда опаздывает.')).toBe(true);
    expect(ru.absolutes.test('Всегдашний спор.')).toBe(false);
  });
});

describe('countNegations', () => {
  it('counts them per statement', () => {
    const nb = packFor('nb')!;
    expect(countNegations('Han kom ikke.', nb)).toBe(1);
    expect(countNegations('Det er ikke sant at han ikke kom.', nb)).toBe(2);
    expect(countNegations('Han kom.', nb)).toBe(0);
  });
});

describe('normalizeText', () => {
  it('collapses case, whitespace and trailing punctuation', () => {
    expect(normalizeText('  Han  kom   for sent!! ')).toBe('han kom for sent');
  });

  it('leaves accents alone — two statements differing by one are two statements', () => {
    expect(normalizeText('mørket')).not.toBe(normalizeText('morket'));
  });
});
