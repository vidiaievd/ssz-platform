import { jest } from '@jest/globals';
import type { LexiconVariant } from '../domain/align-word.js';
import type { PosToken } from '../domain/narrow-variants.js';
import { PassageVariants, withPassageWords } from './passage-variants.js';
import type { IPosTagger } from './ports/pos-tagger.js';
import type { IPronunciationLexiconReader } from './ports/pronunciation-lexicon.reader.js';

// Plan 88, step 4b: one lexicon read and one tagger call per passage; no tagger, no narrowing.

const FOKUSER: LexiconVariant[] = [
  { nofabet: 'F OO1 K UH0 S AX0 R', pos: 'NN', feats: 'PLU|IND|NOM|NEU' },
  { nofabet: 'F OH0 K UH0 S EE1 R', pos: 'VB', feats: 'AKT|IMP' },
];
const PAA: LexiconVariant[] = [
  { nofabet: 'P OA1', pos: 'PP' },
  { nofabet: 'P OAH1', pos: 'PP' },
];
const TOKENS: PosToken[] = [
  { text: 'Fokuser', start: 0, end: 7, upos: 'VERB', morph: 'Mood=Ind|Tense=Pres|VerbForm=Fin', sentStart: true },
  { text: 'på', start: 8, end: 10, upos: 'ADP', morph: '', sentStart: false },
  { text: 'api', start: 11, end: 14, upos: 'NOUN', morph: '', sentStart: false },
  { text: '!', start: 14, end: 15, upos: 'PUNCT', morph: '', sentStart: false },
];

function make(tag: IPosTagger['tag']) {
  const variantsOf = jest.fn<IPronunciationLexiconReader['variantsOf']>(
    async () =>
      new Map([
        ['fokuser', FOKUSER],
        ['på', PAA],
      ]),
  );
  const tagger = { tag: jest.fn(tag) };
  return { service: new PassageVariants({ variantsOf }, tagger), variantsOf, tagger };
}

describe('PassageVariants', () => {
  it('narrows each passage word by its tag', async () => {
    const { service, variantsOf, tagger } = make(async () => TOKENS);
    const words = await service.of('nb', 'Fokuser på api!');

    expect(variantsOf).toHaveBeenCalledWith('nb', ['fokuser', 'på', 'api']);
    expect(tagger.tag).toHaveBeenCalledWith('nb', 'Fokuser på api!');
    expect(words).toEqual([
      { text: 'fokuser', variants: [FOKUSER[1]], narrowedBy: 'pos' },
      { text: 'på', variants: PAA, narrowedBy: 'feats' },
      { text: 'api', variants: [], narrowedBy: 'none' },
    ]);
  });

  it('keeps every variant when the tagger fails', async () => {
    const { service } = make(async () => {
      throw new Error('Tagger answered 404: {"error": "tagger_not_loaded"}');
    });
    const words = await service.of('nb', 'Fokuser på api!');
    expect(words.map((w) => [w.text, w.variants.length, w.narrowedBy])).toEqual([
      ['fokuser', 2, 'untagged'],
      ['på', 2, 'untagged'],
      ['api', 0, 'untagged'],
    ]);
  });

  it('fails when the lexicon cannot answer', async () => {
    const tagger = { tag: async () => TOKENS };
    const service = new PassageVariants({ variantsOf: async () => Promise.reject(new Error('db down')) }, tagger);
    await expect(service.of('nb', 'Fokuser på api!')).rejects.toThrow('db down');
  });
});

describe('withPassageWords', () => {
  it('skips the inserted words when pairing Azure’s words with the passage', () => {
    const passage = [
      { text: 'fokuser', variants: [], narrowedBy: 'untagged' as const },
      { text: 'på', variants: [], narrowedBy: 'untagged' as const },
    ];
    const pronounced = [{ error: 'none' as const }, { error: 'insertion' as const }, { error: 'omission' as const }];
    expect(withPassageWords(pronounced, passage).map((p) => p.passageWord?.text ?? null)).toEqual([
      'fokuser',
      null,
      'på',
    ]);
  });
});
