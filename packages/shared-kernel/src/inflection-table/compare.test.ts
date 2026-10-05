// DECISIONS «Diacritics never fold», «Accepted variants are per cell», and the near miss that
// never turns a wrong cell into a right one (IT-M2, IT-M3, IT-M4).

import { describe, expect, it } from 'vitest';

import { cellOk, nearMiss, norm } from './compare.js';

const cell = (value: string, accept: string[] = []) => ({ value, accept });

describe('norm', () => {
  it('forgives case and spaces, never letters', () => {
    expect(norm('  Har   Søkt ')).toBe('har søkt');
    expect(norm('bøker')).not.toBe(norm('boker'));
  });

  it('reads a decomposed letter as the same letter (NFC)', () => {
    expect(norm('bøker')).toBe(norm('bøker'.normalize('NFD')));
    expect(norm('på'.normalize('NFD'))).toBe('på');
  });
});

describe('cellOk', () => {
  it('IT-M2: a diacritic is a different answer', () => {
    expect(cellOk(cell('bøker'), 'boker')).toBe(false);
    expect(cellOk(cell('bøker'), 'Bøker ')).toBe(true);
  });

  it('IT-M3: a variant is accepted in its own cell only', () => {
    expect(cellOk(cell('boka', ['boken']), 'boken')).toBe(true);
    expect(cellOk(cell('boka'), 'boken')).toBe(false);
  });

  it('an empty answer is never right, not even against an empty key', () => {
    expect(cellOk(cell(''), '')).toBe(false);
    expect(cellOk(cell('hus'), '   ')).toBe(false);
  });
});

describe('nearMiss', () => {
  it('names a non-folding letter written plain or spelt out', () => {
    expect(nearMiss(cell('bøker'), 'boker', 'nb')).toBe('diacritic');
    expect(nearMiss(cell('bøker'), 'boeker', 'nb')).toBe('diacritic');
    expect(nearMiss(cell('på'), 'paa', 'nb')).toBe('diacritic');
    expect(nearMiss(cell('lærer'), 'laerer', 'nb')).toBe('diacritic');
  });

  it('names the slip the other way round too', () => {
    expect(nearMiss(cell('boka'), 'bøka', 'nb')).toBe('diacritic');
  });

  it('checks a variant as well as the key', () => {
    expect(nearMiss(cell('boka', ['boken']), 'bøken', 'nb')).toBe('diacritic');
  });

  it('without a pack there is no diacritic class', () => {
    expect(nearMiss(cell('bøker'), 'boker', '')).toBeNull();
    expect(nearMiss(cell('bøkene'), 'bokene', 'xx')).not.toBe('diacritic');
  });

  it('right stem, wrong ending', () => {
    expect(nearMiss(cell('bøkene'), 'bøker', 'nb')).toBe('ending');
    expect(nearMiss(cell('jobben'), 'jobba', 'nb')).toBe('ending');
  });

  it('asks about the letter before the ending', () => {
    // `boker` also passes the ending rule against `bøker`; the letter is the useful thing to say.
    expect(nearMiss(cell('bøker'), 'boker', 'nb')).toBe('diacritic');
  });

  it('nothing for an empty, a right or an unrelated answer', () => {
    expect(nearMiss(cell('hus'), '', 'nb')).toBeNull();
    expect(nearMiss(cell('hus'), 'Hus', 'nb')).toBeNull();
    expect(nearMiss(cell('husene'), 'katt', 'nb')).toBeNull();
    expect(nearMiss(cell('hus'), 'husene', 'nb')).toBeNull();
  });
});
