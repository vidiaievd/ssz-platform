import { describe, expect, it } from 'vitest';

import { matchWord } from './match.js';

describe('matchWord', () => {
  it('matches the form a real seeded exercise actually holds', () => {
    // The gap in exercise d21ea8ea answers `stillingsannonser`; the vocabulary list holds
    // `stillingsannonse`. Equality would attribute nothing, which is how this plan fails.
    expect(matchWord('stillingsannonse', 'stillingsannonser')).toBe('inflected');
  });

  it('matches exactly when the two agree', () => {
    expect(matchWord('erfaring', 'erfaring')).toBe('exact');
    expect(matchWord('Erfaring', 'erfaring,')).toBe('exact');
  });

  it.each([
    ['hus', 'huset'],
    ['arbeid', 'arbeidet'],
    ['søknad', 'søknaden'],
    ['førerkort', 'førerkortet'],
    ['skrivefeil', 'skrivefeilene'],
    ['jobbe', 'jobber'],
  ])('matches %s → %s', (base, surface) => {
    expect(matchWord(base, surface)).toBe('inflected');
  });

  it('ignores a leading article or infinitive marker on either side', () => {
    // A list writes `hjelpetelefon` or `en hjelpetelefon` as it pleases, and the exercise
    // does the same. Neither side can be relied on to have made the same choice.
    expect(matchWord('hjelpetelefon', 'en hjelpetelefon')).toBe('exact');
    expect(matchWord('en hjelpetelefon', 'hjelpetelefonen')).toBe('inflected');
    expect(matchWord('å henvise', 'henviser')).toBe('inflected');
  });

  it('keeps a bare article as the word it is', () => {
    expect(matchWord('en', 'en')).toBe('exact');
  });

  it('refuses a short base, where the ending outweighs the word', () => {
    // `rett` and `rette` are different words, and so are `si` and `sin`. Suggesting either
    // teaches an author to stop reading the suggestions.
    expect(matchWord('si', 'sin')).toBeNull();
    expect(matchWord('by', 'byer')).toBeNull();
  });

  it('refuses an ending longer than inflection', () => {
    expect(matchWord('arbeid', 'arbeidsmiljø')).toBeNull();
    expect(matchWord('hjelp', 'hjelpemiddel')).toBeNull();
  });

  it('never folds æ ø å into a and o', () => {
    // They are letters of the alphabet here, not decorated vowels. Folding makes `for` and
    // `før` the same word.
    expect(matchWord('for', 'før')).toBeNull();
    expect(matchWord('sa', 'så')).toBeNull();
  });

  it('is asymmetric: the dictionary side is the base form', () => {
    expect(matchWord('huset', 'hus')).toBeNull();
  });

  it('answers null for empty input', () => {
    expect(matchWord('', 'hus')).toBeNull();
    expect(matchWord('hus', '   ')).toBeNull();
  });
});
