import { readLayerInput } from './layer-input.js';

// Plan 86, step 6h.2b: the editor's layer, read by shape before `prosodyIssues` judges the anchors.

const BASE = {
  tokenizer: 'unicode-word-v1',
  stresses: [],
  accents: [],
  boundaries: [],
  links: [],
  orphans: [],
};

describe('readLayerInput', () => {
  it('reads a layer saved before «no stress» existed, sorting each list by token', () => {
    const read = readLayerInput({
      ...BASE,
      accents: [
        { i: 4, w: 'norsk', source: 'teacher' },
        { i: 1, w: 'heter', source: 'ai' },
      ],
    });
    expect(read.ok && read.layer.accents.map((x) => x.i)).toEqual([1, 4]);
    expect(read.ok && read.layer.unstressed).toEqual([]);
  });

  it('keeps orphans of every kind and checks their marks', () => {
    const read = readLayerInput({
      ...BASE,
      orphans: [
        { kind: 'link', mark: { i: 0, w: 'er du', source: 'teacher' } },
        { kind: 'boundary', mark: { i: 3, w: 'Norge', pitch: null, pause: 'long', source: 'ai' } },
      ],
    });
    expect(read.ok && read.layer.orphans.map((x) => x.kind)).toEqual(['link', 'boundary']);
    expect(
      readLayerInput({
        ...BASE,
        orphans: [
          { kind: 'arc', mark: {} },
          { kind: 'accent', mark: { i: -1, w: 'x', source: 'ai' } },
        ],
      }),
    ).toEqual({
      ok: false,
      errors: ['layer.orphans[0].kind: unknown', 'layer.orphans[1].mark.i: not a token index'],
    });
  });

  it('refuses another tokenizer, a missing list and a non-object', () => {
    const { stresses: _, ...noStresses } = BASE;
    expect(readLayerInput({ ...noStresses, tokenizer: 'ws-v0' })).toEqual({
      ok: false,
      errors: ['layer.tokenizer: not unicode-word-v1', 'layer.stresses: not an array'],
    });
    expect(readLayerInput([])).toEqual({ ok: false, errors: ['layer: not an object'] });
  });

  it('refuses a stress with a vowel outside order or a toneme of 3', () => {
    const read = readLayerInput({
      ...BASE,
      stresses: [
        { i: 0, w: 'Jeg', toneme: 3, vowel: { s: 2, e: 1, long: null }, source: 'teacher' },
      ],
    });
    expect(read).toEqual({
      ok: false,
      errors: [
        'layer.stresses[0].toneme: not 1, 2 or null',
        'layer.stresses[0].vowel: not [s, e) in the word',
      ],
    });
  });
});
