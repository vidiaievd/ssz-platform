import { parseProsodyNotation } from '@ssz/shared-kernel/prosody';
import { MarkdownParagraphSplitterService } from '../../../lesson/domain/services/markdown-paragraph-splitter.service.js';
import {
  isEmptyLayer,
  layerForText,
  splitLayer,
  splitSounds,
  studentLayer,
  withSuggestedPhrases,
} from './prosody-view.js';

const at = (notation: string) => parseProsodyNotation(notation);

describe('layerForText', () => {
  it('is empty when nothing is stored', () => {
    expect(isEmptyLayer(layerForText(null, 'Hei'))).toBe(true);
  });

  it('follows an edit of the text from the snapshot the author saved against', () => {
    const { text, layer } = at("Jeg '1heter ^'1Anna \\ |");
    const moved = layerForText({ sourceText: text, layer }, `Hei! ${text}`);
    expect(moved.stresses.map((s) => [s.i, s.w])).toEqual([
      [2, 'heter'],
      [3, 'Anna'],
    ]);
    expect(moved.boundaries.map((b) => [b.i, b.pitch, b.pause])).toEqual([[3, 'fall', 'short']]);
  });
});

describe('studentLayer', () => {
  it('leaves orphans out', () => {
    const { text, layer } = at("Jeg '1heter Anna");
    const edited = layerForText({ sourceText: text, layer }, 'Jeg er Anna');
    expect(edited.orphans).toHaveLength(1);
    const shown = studentLayer('Jeg er Anna', edited);
    expect(shown.orphans).toEqual([]);
    expect(shown.stresses).toEqual([]);
  });

  it('drops a mark whose word is not where its anchor says', () => {
    const { layer } = at("Jeg '1heter Anna");
    expect(studentLayer('Jeg snakker Anna', layer).stresses).toEqual([]);
  });
});

describe('splitLayer', () => {
  it('cuts a whole-body layer into paragraph-local anchors', () => {
    const { text, layer } = at(
      "# '1Hjemme\n\nJeg '2snakker _ litt 'norsk \\ ||\n\n  Ha det _\n\nbra",
    );
    const parts = MarkdownParagraphSplitterService.split(text);
    const layers = splitLayer(text, layer, parts);

    expect(parts).toHaveLength(4);
    expect(layers[0]?.stresses.map((s) => [s.i, s.w])).toEqual([[0, 'Hjemme']]);
    expect(layers[1]?.stresses.map((s) => [s.i, s.w])).toEqual([
      [1, 'snakker'],
      [3, 'norsk'],
    ]);
    expect(layers[1]?.links.map((l) => [l.i, l.w])).toEqual([[1, 'snakker litt']]);
    expect(layers[1]?.boundaries.map((b) => b.i)).toEqual([3]);
    // «det _» joins two paragraphs — the reader cannot draw it.
    expect(layers[2]?.links).toEqual([]);
    expect(layers[3]?.links).toEqual([]);
  });
});

describe('withSuggestedPhrases', () => {
  it('keeps stresses and stress orphans, and takes every phrase mark from the suggestion', () => {
    const authored = parseProsodyNotation("Jeg '1heter ^Anna \\ |").layer;
    authored.orphans = [
      {
        kind: 'stress',
        mark: { i: 9, w: 'borte', toneme: 2, vowel: { s: 1, e: 2, long: null }, source: 'teacher' },
      },
      { kind: 'accent', mark: { i: 9, w: 'borte', source: 'teacher' } },
    ];
    const layer = withSuggestedPhrases(authored, {
      accents: [{ i: 1, w: 'heter', source: 'ai' }],
      boundaries: [],
      links: [{ i: 0, w: 'Jeg heter', source: 'ai' }],
    });

    expect(layer.stresses.map((s) => s.w)).toEqual(['heter']);
    expect(layer.accents).toEqual([{ i: 1, w: 'heter', source: 'ai' }]);
    expect(layer.boundaries).toEqual([]);
    expect(layer.links).toHaveLength(1);
    expect(layer.orphans.map((o) => o.kind)).toEqual(['stress']);
  });
});

describe('splitSounds', () => {
  const word = (i: number, w: string) => ({ i, w, segs: [] });

  it('cuts the sounds of a whole body into its paragraphs, anchors local to each', () => {
    const body = '## Hei\n\nJeg heter Anna.';
    const parts = MarkdownParagraphSplitterService.split(body);
    const cut = splitSounds(body, [word(0, 'Hei'), word(1, 'Jeg'), word(2, 'heter'), word(3, 'Anna')], parts);
    expect(cut.map((x) => x.map((y) => [y.i, y.w]))).toEqual([
      [[0, 'Hei']],
      [
        [0, 'Jeg'],
        [1, 'heter'],
        [2, 'Anna'],
      ],
    ]);
  });

  it('gives a part with no words nothing', () => {
    expect(splitSounds('Hei', [word(0, 'Hei')], ['Hei', ''])).toEqual([[word(0, 'Hei')], []]);
  });
});
