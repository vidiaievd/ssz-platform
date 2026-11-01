import type { LexiconVariant } from './align-word.js';
import { lexiconFeatures, narrowVariants, tagsOfPassageWords, type PosToken, type WordTag } from './narrow-variants.js';

// Plan 88, step 4b: the lexicon's rows (NB Uttale østnorsk, as in ai_db) narrowed by spaCy
// `nb_core_news_md`'s tags — the tokens below are what the sidecar answered for PASSAGE.

const FOKUSER: LexiconVariant[] = [
  { nofabet: 'F OO1 K UH0 S AX0 R', pos: 'NN', feats: 'PLU|IND|NOM|NEU' },
  { nofabet: 'F OH0 K UH0 S EE1 R', pos: 'VB', feats: 'AKT|IMP' },
];
const NOTER: LexiconVariant[] = [
  { nofabet: 'N OO2 T AX0 R', pos: 'NN', feats: 'PLU|IND|NOM|MAS' },
  { nofabet: 'N OH0 T EE1 R', pos: 'VB', feats: 'AKT|IMP' },
];
const TRENER: LexiconVariant[] = [
  { nofabet: 'T R EE2 N AX0 R', pos: 'NN', feats: 'SIN|IND|NOM|MAS' },
  { nofabet: 'T R AX0 N EE1 R', pos: 'VB', feats: 'AKT|IMP' },
  { nofabet: 'T R EE2 N AX0 R', pos: 'VB', feats: 'AKT|PRS' },
];
const ER: LexiconVariant[] = [
  { nofabet: 'EE1 AX0 R', pos: 'NN', feats: 'PLU|IND|NOM|MAS' },
  { nofabet: 'AE1 R', pos: 'VB', feats: 'AKT|PRS' },
  { nofabet: 'AX0 R', pos: 'VB', feats: 'AKT|PRS' },
];
const KOMMER: LexiconVariant[] = [
  { nofabet: 'K OAH2 M AX0 R', pos: 'NN', feats: 'PLU|IND|NOM|NEU' },
  { nofabet: 'K OAH1 M AX0 R', pos: 'VB', feats: 'AKT|PRS' },
];
const BRUK: LexiconVariant[] = [
  { nofabet: 'B R UU1 K', pos: 'NN', feats: 'SIN-PLU|IND|NOM|NEU' },
  { nofabet: 'B R UU1 K', pos: 'VB', feats: 'AKT|IMP' },
];
const TOR: LexiconVariant[] = [
  { nofabet: 'T OO1 R', pos: 'PM|person|FIR|MAS' },
  { nofabet: 'T OO1 R', pos: 'VB', feats: 'AKT|IMP' },
];

const tag = (upos: string, morph = '', clauseInitial = false): WordTag => ({ upos, morph, clauseInitial });
const PRES = 'Mood=Ind|Tense=Pres|VerbForm=Fin';
const nofabet = (vs: LexiconVariant[]) => vs.map((v) => v.nofabet);

describe('lexiconFeatures (§0.8 (3))', () => {
  it.each([
    ['VERB', 'Mood=Imp|VerbForm=Fin', ['IMP', 'AKT']],
    ['VERB', PRES, ['PRS', 'AKT']],
    ['VERB', 'Tense=Past|VerbForm=Part', ['PF', 'AKT']],
    ['VERB', 'VerbForm=Inf|Voice=Pass', ['INF', 'PAS']],
    ['NOUN', 'Definite=Ind|Gender=Masc|Number=Plur', ['PLU', 'IND']],
    ['ADJ', 'Definite=Def|Degree=Sup', ['DEF', 'SUV']],
    ['ADP', '', []],
  ])('%s %s → %j', (upos, morph, expected) => {
    expect([...lexiconFeatures(upos, morph)].sort()).toEqual([...expected].sort());
  });
});

describe('narrowVariants (§0.8 (2))', () => {
  it('keeps the verb of fokuser read as present tense — part of speech alone', () => {
    // spaCy's systematic miss: the imperative of an -ere verb comes as VERB Pres.
    const out = narrowVariants(FOKUSER, tag('VERB', PRES));
    expect(out).toEqual({ variants: [FOKUSER[1]], narrowedBy: 'pos' });
  });

  it('keeps the imperative by its features', () => {
    expect(narrowVariants(FOKUSER, tag('VERB', 'Mood=Imp|VerbForm=Fin', true))).toEqual({
      variants: [FOKUSER[1]],
      narrowedBy: 'feats',
    });
  });

  it('tells the present tense from the imperative of the same verb', () => {
    const out = narrowVariants(TRENER, tag('VERB', PRES));
    expect(out.narrowedBy).toBe('feats');
    expect(nofabet(out.variants)).toEqual(['T R EE2 N AX0 R']);
  });

  it('keeps the noun of kommer, toneme 2', () => {
    const out = narrowVariants(KOMMER, tag('NOUN', 'Definite=Ind|Gender=Neut|Number=Plur'));
    expect(nofabet(out.variants)).toEqual(['K OAH2 M AX0 R']);
  });

  it('leaves both forms of a function word: one tag, two pronunciations', () => {
    const out = narrowVariants(ER, tag('AUX', PRES));
    expect(nofabet(out.variants)).toEqual(['AE1 R', 'AX0 R']);
  });

  it('does not narrow a clause-initial noun whose imperative sounds different (Noter …)', () => {
    expect(narrowVariants(NOTER, tag('NOUN', 'Definite=Ind|Gender=Masc|Number=Plur', true))).toEqual({
      variants: NOTER,
      narrowedBy: 'guard',
    });
  });

  it('narrows the same noun inside a clause', () => {
    const out = narrowVariants(NOTER, tag('NOUN', 'Definite=Ind|Gender=Masc|Number=Plur'));
    expect(nofabet(out.variants)).toEqual(['N OO2 T AX0 R']);
  });

  it('narrows a clause-initial noun whose imperative sounds the same (Bruk …)', () => {
    const out = narrowVariants(BRUK, tag('NOUN', 'Definite=Ind|Gender=Neut|Number=Sing', true));
    expect(out.narrowedBy).toBe('feats');
    expect(out.variants).toEqual([BRUK[0]]);
  });

  it('reads the lexicon part of speech without its subtype (PM|person|FIR|MAS)', () => {
    const out = narrowVariants(TOR, tag('PROPN', 'Gender=Masc', true));
    expect(out.variants).toEqual([TOR[0]]);
  });

  it('keeps every variant when none fits the tag', () => {
    expect(narrowVariants(ER, tag('ADJ', 'Degree=Pos'))).toEqual({ variants: ER, narrowedBy: 'none' });
  });

  it('keeps every variant without a tag', () => {
    expect(narrowVariants(FOKUSER, null)).toEqual({ variants: FOKUSER, narrowedBy: 'untagged' });
  });

  it('takes a lexicon row without features as fitting any', () => {
    const bare: LexiconVariant[] = [{ nofabet: 'L IH1 K AX0 R', pos: 'VB' }, ...TRENER.slice(1)];
    const out = narrowVariants(bare, tag('VERB', PRES));
    expect(nofabet(out.variants)).toEqual(['L IH1 K AX0 R', 'T R EE2 N AX0 R']);
  });
});

const PASSAGE = 'Nei, fokuser på det viktigste. Tor: Noter 10 000 ting i e-posten! De fleste som trener, er glade.';

// What the sidecar answered for PASSAGE (`POST /v1/tag?language=nb`, 01.11).
const TOKENS: PosToken[] = [
  ['Nei', 0, 'INTJ', '', true],
  [',', 3, 'PUNCT', '', false],
  ['fokuser', 5, 'VERB', PRES, false],
  ['på', 13, 'ADP', '', false],
  ['det', 16, 'DET', 'Gender=Neut|Number=Sing|PronType=Dem', false],
  ['viktigste', 20, 'ADJ', 'Definite=Def|Degree=Sup', false],
  ['.', 29, 'PUNCT', '', false],
  ['Tor', 31, 'PROPN', 'Gender=Masc', true],
  [':', 34, 'PUNCT', '', false],
  ['Noter', 36, 'NOUN', 'Definite=Ind|Gender=Masc|Number=Plur', true],
  ['10', 42, 'NUM', 'NumType=Card|Number=Plur', false],
  ['000', 45, 'NUM', 'NumType=Card|Number=Plur', false],
  ['ting', 49, 'NOUN', 'Definite=Ind|Gender=Masc|Number=Plur', false],
  ['i', 54, 'ADP', '', false],
  ['e-posten', 56, 'NOUN', 'Definite=Def|Gender=Masc|Number=Sing', false],
  ['!', 64, 'PUNCT', '', false],
  ['De', 66, 'DET', 'Number=Plur|PronType=Dem', true],
  ['fleste', 69, 'ADJ', 'Definite=Def|Degree=Sup', false],
  ['som', 76, 'PRON', 'PronType=Rel', false],
  ['trener', 80, 'NOUN', 'Definite=Ind|Gender=Masc|Number=Sing', false],
  [',', 86, 'PUNCT', '', false],
  ['er', 88, 'AUX', PRES, false],
  ['glade', 91, 'ADJ', 'Degree=Pos|Number=Plur', false],
  ['.', 96, 'PUNCT', '', false],
].map(([text, start, upos, morph, sentStart]) => ({
  text: text as string,
  start: start as number,
  end: (start as number) + (text as string).length,
  upos: upos as string,
  morph: morph as string,
  sentStart: sentStart as boolean,
}));

describe('tagsOfPassageWords', () => {
  it('gives each lexical word of the passage its token, in order', () => {
    const tags = tagsOfPassageWords(PASSAGE, TOKENS);
    // nei fokuser på det viktigste tor noter 10 000 ting i e-posten de fleste som trener er glade
    expect(tags.map((t) => t?.upos ?? null)).toEqual([
      'INTJ',
      'VERB',
      'ADP',
      'DET',
      'ADJ',
      'PROPN',
      'NOUN',
      'NUM',
      'NUM',
      'NOUN',
      'ADP',
      'NOUN',
      'DET',
      'ADJ',
      'PRON',
      'NOUN',
      'AUX',
      'ADJ',
    ]);
    expect(tags[1]).toEqual({ upos: 'VERB', morph: PRES, clauseInitial: false });
  });

  it('marks the first word of a sentence and the word after a colon', () => {
    const tags = tagsOfPassageWords(PASSAGE, TOKENS);
    const initial = tags.flatMap((t, i) => (t?.clauseInitial ? [i] : []));
    // Nei, Tor, Noter, De
    expect(initial).toEqual([0, 5, 6, 12]);
  });

  it('leaves a word untagged where the tagger split the text differently', () => {
    const tokens: PosToken[] = [
      { text: 'e', start: 0, end: 1, upos: 'NOUN', morph: '', sentStart: true },
      { text: '-', start: 1, end: 2, upos: 'PUNCT', morph: '', sentStart: false },
      { text: 'post', start: 2, end: 6, upos: 'NOUN', morph: '', sentStart: false },
      { text: 'kommer', start: 7, end: 13, upos: 'VERB', morph: PRES, sentStart: false },
    ];
    const tags = tagsOfPassageWords('e-post kommer', tokens);
    expect(tags[0]).toBeNull();
    expect(tags[1]).toEqual({ upos: 'VERB', morph: PRES, clauseInitial: false });
  });

  it('gives no tags without tokens', () => {
    expect(tagsOfPassageWords('Jeg bor her.', [])).toEqual([null, null, null]);
  });
});
