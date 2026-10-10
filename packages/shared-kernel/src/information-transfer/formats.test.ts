// The format normalisers (DECISIONS §1). Every expectation below was read off the prototype's
// `infCanon` run in node on the same inputs (plan 73, phase 1) — except the two marked as fixes.

import { describe, expect, it } from 'vitest';

import { DEFAULT_GRADING } from './model.js';
import type { FieldType } from './model.js';
import { canon, normText, wordsToNumber } from './formats.js';
import { packFor } from './packs/index.js';

const nb = packFor('nb');
const read = (type: FieldType, raw: string, grading = DEFAULT_GRADING): string[] =>
  canon(type, raw, nb, grading);

describe('time (INF-M4)', () => {
  it.each([
    ['17:30', ['17:30']],
    ['17.30', ['17:30']],
    ['kl. 17.30', ['17:30']],
    ['kl 17:30', ['17:30']],
    ['klokka 17.30', ['17:30']],
    ['1730', ['17:30']],
    ['17 30', ['17:30']],
    ['halv seks', ['05:30', '17:30']],
    ['klokka halv seks', ['05:30', '17:30']],
    ['kvart over to', ['02:15', '14:15']],
    ['kvart på fire', ['03:45', '15:45']],
    ['ti på fire', ['03:50', '15:50']],
    ['ti over to', ['02:10', '14:10']],
    ['tjue over tre', ['03:20', '15:20']],
    ['to', ['02:00', '14:00']],
    ['14', ['14:00']],
    ['kl. 14', ['14:00']],
    ['fem over halv tre', []],
  ])('%s', (raw, want) => expect(read('time', raw)).toEqual(want));
});

describe('date (INF-M4)', () => {
  it.each([
    ['3. mars', ['03-03']],
    ['3/3', ['03-03']],
    ['03.03.2026', ['03-03']],
    ['tredje mars', ['03-03']],
    ['3 mars 2026', ['03-03']],
    ['31.12', ['12-31']],
    ['første januar', ['01-01']],
    ['tirsdag 3. mars', []],
  ])('%s', (raw, want) => expect(read('date', raw)).toEqual(want));
});

describe('number (INF-M4)', () => {
  it.each([
    ['204', ['204']],
    ['to hundre og fire', ['204']],
    ['1 250', ['1250']],
    ['tjuefem', ['25']],
    ['femtiseks', ['56']],
    ['tohundre', ['200']],
    ['tusen', ['1000']],
    ['2', ['2']],
    ['rom 204', []],
  ])('%s', (raw, want) => expect(read('number', raw)).toEqual(want));
});

describe('money (INF-M4)', () => {
  it.each([
    ['450', ['450']],
    ['450 kr', ['450']],
    ['450,-', ['450']],
    ['fire hundre og femti', ['450']],
    ['kr 450', ['450']],
    ['NOK 450', ['450']],
    ['450 nok', ['450']],
    // Fixes (plan 73 §4.2): the prototype cut «kroner» at «kr» and read neither as an amount.
    ['450 kroner', ['450']],
    ['fire hundre og femti kroner', ['450']],
    ['450kr', ['450']],
  ])('%s', (raw, want) => expect(read('money', raw)).toEqual(want));
});

describe('phone (INF-M4)', () => {
  it.each([
    ['22 45 67 89', ['22456789']],
    ['+47 22 45 67 89', ['22456789']],
    ['004722456789', ['22456789']],
    ['4722456789', ['22456789']],
    ['12 34', []],
  ])('%s', (raw, want) => expect(read('phone', raw)).toEqual(want));
});

describe('the lexical path', () => {
  it('folds case and punctuation', () => {
    expect(read('name', 'Anne Lise Berg')).toEqual(['anne lise berg']);
    expect(read('word', '«Svømmehallen».')).toEqual(['svømmehallen']);
  });
  it('keeps case when strict', () => {
    expect(read('name', ' Anne Lise ', { ...DEFAULT_GRADING, strictCase: true })).toEqual(['Anne Lise']);
  });
  it('normalises to NFC — a decomposed ø from a phone keyboard is the same letter', () => {
    expect(normText('Tøyen'.normalize('NFD'))).toBe('tøyen');
  });
});

describe('spelled-out numerals switched off (INF-M6)', () => {
  const off = { ...DEFAULT_GRADING, spelledNumbers: false };
  it('reads nothing without a digit', () => {
    expect(read('time', 'halv seks', off)).toEqual([]);
    expect(read('money', 'fire hundre og femti', off)).toEqual([]);
  });
  it('still reads digits, with the words around them', () => {
    expect(read('time', 'kl. 17.30', off)).toEqual(['17:30']);
    expect(read('money', '450 kroner', off)).toEqual(['450']);
  });
  it('does not touch the lexical path', () => {
    expect(read('word', 'fire', off)).toEqual(['fire']);
  });
});

describe('without a pack (decision Q2-A)', () => {
  const none = (type: FieldType, raw: string): string[] => canon(type, raw, undefined, DEFAULT_GRADING);
  it('reads digits', () => {
    expect(none('time', '17:30')).toEqual(['17:30']);
    expect(none('date', '03.03')).toEqual(['03-03']);
    expect(none('number', '204')).toEqual(['204']);
    expect(none('money', '450')).toEqual(['450']);
    expect(none('phone', '22 45 67 89')).toEqual(['22456789']);
  });
  it('reads no words — no Norwegian is lent to another course', () => {
    expect(none('time', 'halv seks')).toEqual([]);
    expect(none('time', 'kl. 17.30')).toEqual([]);
    expect(none('date', '3. mars')).toEqual([]);
    expect(none('money', '450 kr')).toEqual([]);
    expect(none('phone', '+47 22 45 67 89')).toEqual(['4722456789']);
  });
  it('spells no number', () => expect(wordsToNumber('fire', undefined)).toBeNull());
});

describe('the pack is the only Norwegian (INF-M5)', () => {
  it('finds the pack by the base language', () => {
    expect(packFor('nb-NO')?.language).toBe('nb');
    expect(packFor('NB')?.language).toBe('nb');
    expect(packFor('uk')).toBeUndefined();
  });
});
