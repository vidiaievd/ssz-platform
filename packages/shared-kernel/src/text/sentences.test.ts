// Plan 86, step 6d — the sentences of a passage, as runs of its tokens.

import { describe, expect, it } from 'vitest';

import { splitSentences } from './sentences.js';
import { tokenize } from './words.js';

const split = (text: string) => splitSentences(text).map((x) => text.slice(x.s, x.e));

describe('splitSentences', () => {
  it('ends a sentence at . ! ? … and keeps the terminator', () => {
    expect(split('Jeg heter Anna. Hvem er du? Fint! Vel…')).toEqual(['Jeg heter Anna.', 'Hvem er du?', 'Fint!', 'Vel…']);
  });

  it('numbers tokens of the whole passage, every token in one sentence', () => {
    const text = 'Jeg heter Anna. Hvem er du?';
    const sentences = splitSentences(text);
    expect(sentences.map((x) => [x.index, x.first, x.end])).toEqual([
      [0, 0, 3],
      [1, 3, 6],
    ]);
    expect(tokenize(text)).toHaveLength(6);
  });

  it('does not end at an abbreviation before a lower-case word', () => {
    expect(split('Han kjøper bl.a. brød og f.eks. melk. Så går han.')).toEqual([
      'Han kjøper bl.a. brød og f.eks. melk.',
      'Så går han.',
    ]);
  });

  it('does not end at an ordinal or a decimal number', () => {
    expect(split('Vi møtes den 1. mai. Prisen er 3.5 kroner.')).toEqual([
      'Vi møtes den 1. mai.',
      'Prisen er 3.5 kroner.',
    ]);
  });

  it('ends after an abbreviation when a capital follows', () => {
    expect(split('Brød, melk osv. Han kom.')).toEqual(['Brød, melk osv.', 'Han kom.']);
  });

  it('takes the closing quote with the sentence and a run of terminators as one end', () => {
    expect(split('Han sa: «Kom!» Hva?! Ja...')).toEqual(['Han sa: «Kom!»', 'Hva?!', 'Ja...']);
  });

  it('ends at a line break', () => {
    expect(split('Hei\nPå gjensyn')).toEqual(['Hei', 'På gjensyn']);
  });

  it('keeps a text without a final stop as one sentence and drops wordless ones', () => {
    expect(split('Jeg heter Anna')).toEqual(['Jeg heter Anna']);
    expect(split('... ?! —')).toEqual([]);
    expect(split('')).toEqual([]);
  });
});
