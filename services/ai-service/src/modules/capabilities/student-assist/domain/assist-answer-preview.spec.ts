import { AssistAnswerPreview, previewBlocks, type AssistDelta } from './assist-answer-preview.js';

const ANSWER = JSON.stringify({
  blocks: [
    { type: 'text', text: 'Adjektivet «ny» står i ubestemt form: "nytt hus".', emphasis: [[0, 9]] },
    { type: 'example', text: 'Jeg har et nytt hus.\nDet er 😀 fint.', emphasis: [] },
  ],
  citations: [{ kind: 'grammar_rule', id: 'r1' }],
  suggestions: [{ kind: 'ask', text: 'blocks?', lemma: null, translation: null, target: null }],
});

describe('previewBlocks', () => {
  it('reads every block of a complete answer, and nothing else', () => {
    expect(previewBlocks(ANSWER)).toEqual([
      { type: 'text', text: 'Adjektivet «ny» står i ubestemt form: "nytt hus".' },
      { type: 'example', text: 'Jeg har et nytt hus.\nDet er 😀 fint.' },
    ]);
  });

  it('gives a block’s text as far as it goes, and its type only once complete', () => {
    expect(previewBlocks('{"blocks":[{"type":"te')).toEqual([]);
    expect(previewBlocks('{"blocks":[{"type":"text","text":"Adjek')).toEqual([{ type: 'text', text: 'Adjek' }]);
  });

  it('leaves out an escape cut off at the end, and half a surrogate pair', () => {
    expect(previewBlocks('{"blocks":[{"text":"a\\')).toEqual([{ type: null, text: 'a' }]);
    expect(previewBlocks('{"blocks":[{"text":"a\\u00')).toEqual([{ type: null, text: 'a' }]);
    expect(previewBlocks('{"blocks":[{"text":"a\\ud83d')).toEqual([{ type: null, text: 'a' }]);
    expect(previewBlocks('{"blocks":[{"text":"a\\ud83d\\ude00')).toEqual([{ type: null, text: 'a😀' }]);
  });

  it('skips a fence before the JSON and reads nothing from prose', () => {
    expect(previewBlocks('```json\n{"blocks":[{"text":"Hei"')).toEqual([{ type: null, text: 'Hei' }]);
    expect(previewBlocks('Let me look that up.')).toEqual([]);
  });

  it('does not take a "text" outside the blocks for a block', () => {
    expect(previewBlocks('{"suggestions":[{"kind":"ask","text":"Hva?"}],"blocks":[{"text":"Ja"}]}')).toEqual([{ type: null, text: 'Ja' }]);
  });
});

describe('AssistAnswerPreview', () => {
  it('sends what is new, piece by piece, and the pieces add up to the blocks', () => {
    const preview = new AssistAnswerPreview();
    const deltas: AssistDelta[] = [];
    for (let i = 0; i < ANSWER.length; i += 7) deltas.push(...preview.push(ANSWER.slice(i, i + 7)));

    const texts: string[] = [];
    const types: (string | undefined)[] = [];
    for (const d of deltas) {
      texts[d.block] = (texts[d.block] ?? '') + d.text;
      types[d.block] = d.type ?? types[d.block];
    }
    expect(texts).toEqual(previewBlocks(ANSWER).map((b) => b.text));
    expect(types).toEqual(['text', 'example']);
    expect(deltas.every((d) => !/[\ud800-\udbff]$/.test(d.text))).toBe(true);
    expect(preview.spoke).toBe(true);
  });

  it('has said nothing until a block appears', () => {
    const preview = new AssistAnswerPreview();
    expect(preview.push('{"blocks":[')).toEqual([]);
    expect(preview.spoke).toBe(false);
  });
});
