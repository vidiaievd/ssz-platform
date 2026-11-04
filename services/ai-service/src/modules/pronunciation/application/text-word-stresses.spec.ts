import { jest } from '@jest/globals';
import type { LexiconVariant } from '../domain/align-word.js';
import type { PosToken } from '../domain/narrow-variants.js';
import type { IPosTagger } from './ports/pos-tagger.js';
import type { IPronunciationLexiconReader } from './ports/pronunciation-lexicon.reader.js';
import type { CachedWordStresses, IWordStressCache } from './ports/word-stress.cache.js';
import { cacheKey, TextWordStresses, type Span } from './text-word-stresses.js';

// Plan 86, step 5b: one lexicon read and one tagger call per text, the answer per span, cached.

const TEXT = 'Han kommer på mandag.';
const SPANS: Span[] = [
  [0, 3],
  [4, 10],
  [11, 13],
  [14, 20],
];
const LEXICON = new Map<string, LexiconVariant[]>([
  ['han', [{ nofabet: 'H AH1 N', pos: 'PN' }]],
  [
    'kommer',
    [
      { nofabet: 'K OAH2 M AX0 R', pos: 'NN', feats: 'PLU|IND|NOM|NEU' },
      { nofabet: 'K OAH1 M AX0 R', pos: 'VB', feats: 'AKT|PRS' },
    ],
  ],
  ['på', [{ nofabet: 'P OA1', pos: 'PP' }]],
  ['mandag', [{ nofabet: 'M AH2 N D AH0 G', pos: 'NN' }]],
]);
const TOKENS: PosToken[] = [
  { text: 'Han', start: 0, end: 3, upos: 'PRON', morph: '', sentStart: true },
  { text: 'kommer', start: 4, end: 10, upos: 'VERB', morph: 'Mood=Ind|Tense=Pres|VerbForm=Fin', sentStart: false },
  { text: 'på', start: 11, end: 13, upos: 'ADP', morph: '', sentStart: false },
  { text: 'mandag', start: 14, end: 20, upos: 'NOUN', morph: '', sentStart: false },
  { text: '.', start: 20, end: 21, upos: 'PUNCT', morph: '', sentStart: false },
];

function make(tag: IPosTagger['tag'], lexicon = LEXICON) {
  const stored = new Map<string, CachedWordStresses>();
  const cache: IWordStressCache = {
    get: jest.fn(async (key: string) => stored.get(key) ?? null),
    set: jest.fn(async (key: string, value: CachedWordStresses) => void stored.set(key, value)),
  };
  const variantsOf = jest.fn<IPronunciationLexiconReader['variantsOf']>(async () => lexicon);
  const tagger = { tag: jest.fn(tag) };
  return { service: new TextWordStresses({ variantsOf }, tagger, cache), variantsOf, tagger, cache, stored };
}

describe('TextWordStresses', () => {
  it('answers each span, narrowing homographs by the tagger and leaving function words out', async () => {
    const { service, variantsOf } = make(async () => TOKENS);
    const out = await service.of('nb', TEXT, SPANS);
    expect(out.map((s) => s.stress?.toneme ?? '-')).toEqual(['-', 1, '-', 2]);
    expect(out[3]?.stress?.vowel).toEqual({ s: 1, e: 2, long: false });
    expect(variantsOf).toHaveBeenCalledWith('nb', ['han', 'kommer', 'på', 'mandag']);
  });

  it('lays the letters over the sounds, function words included, and leaves a homograph open', async () => {
    const { service } = make(async () => TOKENS);
    const out = await service.of('nb', TEXT, SPANS);
    // *han* is a pronoun: no stress mark, but it has sounds.
    expect(out[0]?.stress).toBeNull();
    expect(out[0]?.segs?.map((x) => x.sounds.join('.'))).toEqual(['H', 'AH', 'N']);
    // *mandag*: the vowel is short, the stress is 2.
    expect(out[3]?.segs?.find((x) => x.kind === 'vowel' && x.stress === 2)).toMatchObject({ s: 1, e: 2, long: false });
  });

  it('gives an untagged homograph no sounds when its variants lay differently', async () => {
    const { service } = make(async () => {
      throw new Error('down');
    });
    const out = await service.of('nb', TEXT, SPANS);
    // `kommer` noun 2 / verb 1: same letters, different stress digits.
    expect(out[1]?.segs).toBeNull();
    expect(out[3]?.segs).not.toBeNull();
  });

  it('serves a second read of the same text from the cache', async () => {
    const { service, variantsOf, tagger } = make(async () => TOKENS);
    const first = await service.of('nb', TEXT, SPANS);
    expect(await service.of('nb', TEXT, SPANS)).toEqual(first);
    expect(variantsOf).toHaveBeenCalledTimes(1);
    expect(tagger.tag).toHaveBeenCalledTimes(1);
  });

  it('goes on without the tagger, and does not cache that answer', async () => {
    const { service, cache } = make(async () => {
      throw new Error('down');
    });
    const out = await service.of('nb', TEXT, SPANS);
    // `kommer` keeps both variants, which disagree; `han` is a pronoun by the lexicon alone.
    expect(out.map((s) => s.stress?.toneme ?? '-')).toEqual(['-', '-', '-', 2]);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('calls no tagger for a language without a lexicon', async () => {
    const { service, tagger } = make(async () => TOKENS, new Map());
    expect(await service.of('de', 'Er kommt.', [[0, 2]])).toEqual([{ stress: null, segs: null }]);
    expect(tagger.tag).not.toHaveBeenCalled();
  });

  it('keys the cache by language, text and spans', () => {
    const key = cacheKey('nb', TEXT, SPANS);
    expect(key).toMatch(/^v2:nb:[0-9a-f]{64}$/);
    expect(cacheKey('nb', TEXT, SPANS.slice(1))).not.toBe(key);
    expect(cacheKey('nn', TEXT, SPANS)).not.toBe(key);
  });
});
