// Rows from the course dictionary (DECISIONS §3, plan 69 §3.7–3.8), on entries shaped like the
// seeded `vocab.json`.

import { describe, expect, it } from 'vitest';

import type { DictionaryEntry } from './dictionary.js';
import { bare, entriesFor, fromDictionary, lemmaOf } from './dictionary.js';
import { packFor } from './packs.js';

const pack = packFor('nb')!;
const noun = pack.paradigms.find((p) => p.id === 'noun')!;
const verb = pack.paradigms.find((p) => p.id === 'verb')!;
const adj = pack.paradigms.find((p) => p.id === 'adj')!;

const SOKNAD: DictionaryEntry = {
  id: 'v1',
  word: 'søknad',
  pos: 'NOUN',
  gloss: 'application',
  unit: '1 — Arbeid',
  properties: {
    gender: 'masculine',
    definite_singular: 'søknaden',
    plural_form: 'søknader',
    definite_plural: 'søknadene',
  },
};
const BOK: DictionaryEntry = {
  id: 'v2',
  word: 'bok',
  pos: 'NOUN',
  gloss: 'book',
  unit: '2 — Skole',
  properties: { gender: 'feminine', definite_singular: 'boka', plural_form: 'bøker' },
};
const SOKE: DictionaryEntry = {
  id: 'v3',
  word: 'søke',
  pos: 'VERB',
  gloss: 'to apply',
  unit: '1 — Arbeid',
  properties: { present_tense: 'søker', past_tense: 'søkte', perfect_tense: 'søkt' },
};
const STOR: DictionaryEntry = {
  id: 'v4',
  word: 'stor',
  pos: 'ADJECTIVE',
  gloss: 'big',
  unit: '3 — Hjemme',
  properties: { neuter_form: 'stort', plural_form: 'store' },
};

describe('fromDictionary', () => {
  it('spells a noun with its article and suggests every form the entry has', () => {
    const row = fromDictionary(SOKNAD, pack, noun, noun.slots);
    expect(row).toMatchObject({ lemma: 'en søknad', gloss: 'application', dictId: 'v1' });
    expect(
      Object.fromEntries(Object.entries(row.cells).map(([k, c]) => [k, [c.mode, c.value]])),
    ).toEqual({
      indefSg: ['prefill', 'søknad'],
      defSg: ['ask', 'søknaden'],
      indefPl: ['ask', 'søknader'],
      defPl: ['ask', 'søknadene'],
    });
  });

  it('leaves a form the dictionary lacks empty — a suggestion, never a guess', () => {
    const row = fromDictionary(BOK, pack, noun, noun.slots);
    expect(row.lemma).toBe('ei bok');
    expect(row.cells['defPl']?.value).toBe('');
  });

  it('builds the infinitive and the perfect from the pack’s patterns', () => {
    const row = fromDictionary(SOKE, pack, verb, verb.slots);
    expect(row.lemma).toBe('å søke');
    expect(row.cells['inf']?.value).toBe('å søke');
    expect(row.cells['perf']?.value).toBe('har søkt');
  });

  it('an adjective arrives with its positive only (plan 69 §8, item 4)', () => {
    const row = fromDictionary(STOR, pack, adj, adj.slots);
    expect(row.cells['pos']?.value).toBe('stor');
    expect(row.cells['comp']?.value).toBe('');
    expect(row.cells['sup']?.value).toBe('');
  });

  it('only over the slots in play', () => {
    const row = fromDictionary(SOKNAD, pack, noun, noun.slots.slice(1, 3));
    expect(Object.keys(row.cells)).toEqual(['defSg', 'indefPl']);
    expect(row.cells['defSg']?.mode).toBe('prefill');
  });

  it('a word without gender still has a lemma', () => {
    expect(lemmaOf({ ...SOKNAD, properties: {} }, pack, noun)).toBe('søknad');
  });

  it('does not double an article or infinitive mark the dictionary already carries', () => {
    expect(lemmaOf({ ...SOKE, word: 'å søke' }, pack, verb)).toBe('å søke');
    expect(bare('en jobb', pack)).toBe('jobb');
  });
});

describe('entriesFor', () => {
  const all = [SOKNAD, BOK, SOKE, STOR];

  it('lists the paradigm’s part of speech only', () => {
    expect(entriesFor(all, noun).map((e) => e.id)).toEqual(['v1', 'v2']);
    expect(entriesFor(all, verb).map((e) => e.id)).toEqual(['v3']);
  });

  it('searches the word and the gloss', () => {
    expect(entriesFor(all, noun, 'BOOK').map((e) => e.id)).toEqual(['v2']);
    expect(entriesFor(all, noun, 'søk').map((e) => e.id)).toEqual(['v1']);
  });
});
