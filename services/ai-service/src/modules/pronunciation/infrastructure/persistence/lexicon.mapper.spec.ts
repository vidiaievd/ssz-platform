import { LEXICON_OF_LANGUAGE, lookupKeys, variantsByWord } from './lexicon.mapper.js';

// Plan 88, step 4: one read of the lexicon per passage.

describe('lexicon mapper', () => {
  it('looks each word up once, lowercased', () => {
    expect(lookupKeys(['Jeg', 'bor', 'jeg', '', 'Fokuser'])).toEqual(['jeg', 'bor', 'fokuser']);
  });

  it('groups the rows by word in the order read, empty features left out', () => {
    const variants = variantsByWord([
      { wordKey: 'fokuser', nofabet: 'F OO1 K UH0 S AX0 R', pos: 'NN', feats: 'PLU|IND' },
      { wordKey: 'det', nofabet: 'D EE1', pos: 'PN', feats: '' },
      { wordKey: 'fokuser', nofabet: 'F OH0 K UH0 S EE1 R', pos: 'VB', feats: 'IMP' },
    ]);
    expect(Object.fromEntries(variants)).toEqual({
      fokuser: [
        { nofabet: 'F OO1 K UH0 S AX0 R', pos: 'NN', feats: 'PLU|IND' },
        { nofabet: 'F OH0 K UH0 S EE1 R', pos: 'VB', feats: 'IMP' },
      ],
      det: [{ nofabet: 'D EE1', pos: 'PN' }],
    });
  });

  it('reads Bokmål from NB Uttale østnorsk and nothing else yet', () => {
    expect(LEXICON_OF_LANGUAGE['nb']).toEqual({ dialect: 'e', source: 'nb_uttale' });
    expect(LEXICON_OF_LANGUAGE['nn']).toBeUndefined();
  });
});
