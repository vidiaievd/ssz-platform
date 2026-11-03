// Plan 86, §4a — the prosody layer: notation, validation, re-anchoring, merge.

import { describe, expect, it } from 'vitest';

import { prosodyIssues } from './issues.js';
import { mergeProsody } from './merge.js';
import type { ProsodyLayer, WordStress } from './model.js';
import { emptyProsodyLayer } from './model.js';
import { checkProsodyNotation, parseProsodyNotation, toProsodyNotation } from './notation.js';
import { reanchorProsody } from './reanchor.js';
import { stressedVowelFrom, syllableStart } from './spelling.js';

const TEXT = 'Jeg heter Anna, og jeg snakker litt norsk.';
const NOTATION = "Jeg '1heter ^'1Anna, \\ | og jeg '2snakker _ litt 'norsk. \\ ||";

const layer = (patch: Partial<ProsodyLayer>): ProsodyLayer => ({
  ...emptyProsodyLayer(),
  ...patch,
});

describe('spelling', () => {
  it('finds the stressed vowel from the mark, diphthongs whole', () => {
    expect(stressedVowelFrom('snakker', 0)).toEqual({ s: 2, e: 3, long: null });
    expect(stressedVowelFrom('geiter', 0)).toEqual({ s: 1, e: 3, long: null });
    expect(stressedVowelFrom('betale', 2)).toEqual({ s: 3, e: 4, long: null });
    expect(stressedVowelFrom('poeng', 0)).toEqual({ s: 1, e: 2, long: null });
    expect(stressedVowelFrom('brr', 0)).toBeNull();
  });

  it('starts the stressed syllable at a legal onset', () => {
    expect(syllableStart('snakker', 2)).toBe(0);
    expect(syllableStart('kjøkken', 2)).toBe(0);
    expect(syllableStart('betale', 3)).toBe(2);
    expect(syllableStart('fortelle', 4)).toBe(3);
    expect(syllableStart('forstå', 5)).toBe(3);
    expect(syllableStart('idé', 2)).toBe(1);
    expect(syllableStart('e-post', 3)).toBe(2);
  });
});

describe('parseProsodyNotation', () => {
  it('recovers the text and every mark', () => {
    const { text, layer: l, issues } = parseProsodyNotation(NOTATION);
    expect(issues).toEqual([]);
    expect(text).toBe(TEXT);
    expect(l.stresses.map((s) => [s.i, s.w, s.toneme, s.vowel.s])).toEqual([
      [1, 'heter', 1, 1],
      [2, 'Anna', 1, 0],
      [5, 'snakker', 2, 2],
      [7, 'norsk', null, 1],
    ]);
    expect(l.stresses.every((s) => s.source === 'teacher' && s.vowel.long === null)).toBe(true);
    expect(l.accents).toEqual([{ i: 2, w: 'Anna', source: 'teacher' }]);
    expect(l.boundaries).toEqual([
      { i: 2, w: 'Anna', pitch: 'fall', pause: 'short', source: 'teacher' },
      { i: 7, w: 'norsk', pitch: 'fall', pause: 'long', source: 'teacher' },
    ]);
    expect(l.links).toEqual([{ i: 5, w: 'snakker litt', source: 'teacher' }]);
  });

  it('takes a mark inside a word, and the source it is given', () => {
    const { text, layer: l } = parseProsodyNotation("Vi må for'1stå det.", 'ai');
    expect(text).toBe('Vi må forstå det.');
    expect(l.stresses).toEqual([
      { i: 2, w: 'forstå', toneme: 1, vowel: { s: 5, e: 6, long: null }, source: 'ai' },
    ]);
  });

  it('leaves apostrophes, slashes and underscores inside words as text', () => {
    const src = "Don't touch C#/.NET or snake_case, '90-tallet ok.";
    const { text, layer: l, issues } = parseProsodyNotation(src);
    expect(text).toBe(src);
    expect(issues).toEqual([]);
    expect(l).toEqual(emptyProsodyLayer());
  });

  it('puts a marker before a line break with the line it ends', () => {
    const { text, layer: l } = parseProsodyNotation('Hei \\ ||\nHvordan går det? /');
    expect(text).toBe('Hei\nHvordan går det?');
    expect(l.boundaries.map((b) => [b.i, b.pitch, b.pause])).toEqual([
      [0, 'fall', 'long'],
      [3, 'rise', null],
    ]);
  });

  it('reports what cannot be placed', () => {
    const codes = (n: string) => parseProsodyNotation(n).issues.map((x) => x.code);
    expect(codes('\\ Hei')).toEqual(['PN_MARKER_AT_LINE_START']);
    expect(codes('Hei\n| der')).toEqual(['PN_MARKER_AT_LINE_START']);
    expect(codes('« \\ Hei')).toEqual(['PN_MARKER_NO_WORD']);
    expect(codes('Hei der _')).toEqual(['PN_LINK_AT_END']);
    expect(codes("'1brr")).toEqual(['PN_STRESS_NO_VOWEL']);
    expect(codes("'1sna'2kker")).toEqual(['PN_DUPLICATE']);
    expect(codes('Hei / \\ der')).toEqual(['PN_DUPLICATE']);
    expect(codes('Hei _ \\ der')).toEqual(['PN_LINK_WITH_BOUNDARY']);
  });
});

describe('toProsodyNotation', () => {
  it('round-trips the canonical notation', () => {
    const { text, layer: l } = parseProsodyNotation(NOTATION);
    expect(toProsodyNotation(text, l)).toEqual({ notation: NOTATION, dropped: 0 });
  });

  it('writes the mark before the stressed syllable', () => {
    const vowel = (s: number, e: number) => ({ s, e, long: true });
    const l = layer({
      stresses: [
        { i: 0, w: 'Vi', toneme: null, vowel: vowel(1, 2), source: 'lexicon' },
        { i: 1, w: 'fortelle', toneme: 2, vowel: vowel(4, 5), source: 'lexicon' },
        { i: 2, w: 'betale', toneme: 1, vowel: vowel(3, 4), source: 'lexicon' },
      ],
    });
    expect(toProsodyNotation('Vi fortelle betale', l).notation).toBe("'Vi for'2telle be'1tale");
  });

  it('drops a mark that has no word or no room', () => {
    const l = layer({
      stresses: [
        { i: 0, w: 'annet', toneme: 2, vowel: { s: 0, e: 1, long: null }, source: 'teacher' },
      ],
      boundaries: [{ i: 0, w: 'ord', pitch: 'fall', pause: null, source: 'teacher' }],
    });
    expect(toProsodyNotation('ord.Neste', l)).toEqual({ notation: 'ord.Neste', dropped: 2 });
  });
});

describe('checkProsodyNotation', () => {
  it('passes the notation of its own text', () => {
    expect(checkProsodyNotation(TEXT, NOTATION).issues).toEqual([]);
  });

  it('names where the text and the notation part', () => {
    const { issues } = checkProsodyNotation(TEXT, NOTATION.replace('litt', 'lite'));
    expect(issues).toEqual([{ code: 'PN_TEXT_MISMATCH', textAt: TEXT.indexOf('litt') + 3 }]);
  });

  it('catches a text whose own quote reads as a stress mark', () => {
    const text = "Han sa 'hei' til meg.";
    const { issues } = checkProsodyNotation(
      text,
      toProsodyNotation(text, emptyProsodyLayer()).notation,
    );
    expect(issues.map((x) => x.code)).toEqual(['PN_TEXT_MISMATCH']);
  });
});

describe('prosodyIssues', () => {
  const parsed = parseProsodyNotation(NOTATION).layer;

  it('accepts a layer on its own text', () => {
    expect(prosodyIssues(TEXT, parsed)).toEqual([]);
  });

  it('accepts a re-capitalised word', () => {
    expect(prosodyIssues(TEXT.replace('heter', 'HETER'), parsed)).toEqual([]);
  });

  it('blocks stale and missing anchors', () => {
    const issues = prosodyIssues('Jeg heter Ola.', parsed);
    expect(issues).toContainEqual({
      code: 'PR_ANCHOR_STALE',
      level: 'blocker',
      kind: 'stress',
      i: 2,
      expected: 'anna',
      found: 'ola',
    });
    expect(issues).toContainEqual({
      code: 'PR_ANCHOR_MISSING',
      level: 'blocker',
      kind: 'stress',
      i: 5,
    });
  });

  it('blocks a vowel outside its word, an empty group end, a doubled mark', () => {
    const issues = prosodyIssues(
      'Hei der',
      layer({
        stresses: [
          { i: 0, w: 'Hei', toneme: null, vowel: { s: 2, e: 5, long: true }, source: 'lexicon' },
          { i: 0, w: 'Hei', toneme: null, vowel: { s: 1, e: 3, long: true }, source: 'teacher' },
        ],
        boundaries: [{ i: 0, w: 'Hei', pitch: null, pause: null, source: 'teacher' }],
      }),
    );
    expect(issues.map((x) => x.code)).toEqual([
      'PR_VOWEL_OUTSIDE_WORD',
      'PR_DUPLICATE',
      'PR_BOUNDARY_EMPTY',
    ]);
  });

  it('warns about a link across a group end and about orphans', () => {
    const l = layer({
      boundaries: [{ i: 0, w: 'Hei', pitch: 'fall', pause: null, source: 'teacher' }],
      links: [{ i: 0, w: 'Hei der', source: 'teacher' }],
      orphans: [{ kind: 'accent', mark: { i: 4, w: 'borte', source: 'teacher' } }],
    });
    expect(prosodyIssues('Hei der', l).map((x) => x.code)).toEqual([
      'PR_LINK_ACROSS_BOUNDARY',
      'PR_ORPHANS',
    ]);
  });

  it('refuses a layer counted with another tokenizer', () => {
    const l = { ...parsed, tokenizer: 'other-v9' } as unknown as ProsodyLayer;
    expect(prosodyIssues(TEXT, l)).toEqual([
      { code: 'PR_TOKENIZER', level: 'blocker', tokenizer: 'other-v9' },
    ]);
  });
});

describe('reanchorProsody', () => {
  const parsed = parseProsodyNotation(NOTATION).layer;

  it('follows the words through an edit elsewhere', () => {
    const next = 'Hei! Jeg heter Anna, og jeg snakker litt norsk.';
    const moved = reanchorProsody(TEXT, next, parsed);
    expect(moved.orphans).toEqual([]);
    expect(prosodyIssues(next, moved)).toEqual([]);
    expect(moved.stresses.map((s) => s.i)).toEqual([2, 3, 6, 8]);
    expect(moved.links).toEqual([{ i: 6, w: 'snakker litt', source: 'teacher' }]);
  });

  it('keeps a mark on its occurrence when the same word is inserted before it', () => {
    const text = 'Det var kaldt. Hun var sliten.';
    const l = parseProsodyNotation("Det var kaldt. Hun 'var sliten.").layer;
    const next = 'Det var kaldt, det var vått. Hun var sliten.';
    const moved = reanchorProsody(text, next, l);
    // The ordinal alone would land on the second «var» of the new text (token 4).
    expect(moved.stresses.map((s) => s.i)).toEqual([7]);
  });

  it('lands a rewritten sentence by words and ordinal, and takes the new spelling', () => {
    const l = parseProsodyNotation("Hun 'var trøtt. Han 'var sliten.").layer;
    const moved = reanchorProsody(
      'Hun var trøtt. Han var sliten.',
      'Han VAR sliten, hun var trøtt.',
      l,
    );
    expect(moved.orphans).toEqual([]);
    expect(moved.stresses.map((s) => [s.i, s.w])).toEqual([
      [1, 'VAR'],
      [4, 'var'],
    ]);
  });

  it('turns a mark whose words are gone into an orphan', () => {
    const moved = reanchorProsody(TEXT, 'Jeg heter Ola, og jeg snakker litt norsk.', parsed);
    expect(moved.orphans.map((o) => [o.kind, o.mark.w])).toEqual([
      ['stress', 'Anna'],
      ['accent', 'Anna'],
      ['boundary', 'Anna'],
    ]);
    expect(
      prosodyIssues('Jeg heter Ola, og jeg snakker litt norsk.', moved).map((x) => x.code),
    ).toEqual(['PR_ORPHANS']);
  });

  it('orphans the second of two marks that land on one word', () => {
    const l = parseProsodyNotation("'1Ja, '2ja.").layer;
    const moved = reanchorProsody('Ja, ja.', 'Ja.', l);
    expect(moved.stresses.map((s) => s.i)).toEqual([0]);
    expect(moved.orphans).toHaveLength(1);
  });

  it('breaks a link when a word comes between its two', () => {
    const l = parseProsodyNotation('snakker _ litt').layer;
    const moved = reanchorProsody('snakker litt', 'snakker veldig litt', l);
    expect(moved.links).toEqual([]);
    expect(moved.orphans.map((o) => o.kind)).toEqual(['link']);
  });
});

describe('mergeProsody', () => {
  const lex = (
    i: number,
    w: string,
    toneme: 1 | 2 | null,
    s: number,
    e: number,
    long: boolean,
  ): WordStress => ({
    i,
    w,
    toneme,
    vowel: { s, e, long },
    source: 'lexicon',
  });

  it('shows the lexicon words alone for a text nobody marked', () => {
    const words = [lex(1, 'liker', 2, 1, 2, true)];
    expect(mergeProsody(words)).toEqual({ ...emptyProsodyLayer(), stresses: words });
  });

  it('lets an authored word win and fills its length from the lexicon', () => {
    const authored = parseProsodyNotation("Jeg '1liker ^'2snakker \\").layer;
    const merged = mergeProsody(
      [
        lex(1, 'liker', 2, 1, 2, true),
        lex(2, 'snakker', 2, 2, 3, false),
        lex(0, 'Jeg', null, 1, 2, false),
      ],
      authored,
    );
    expect(merged.stresses.map((s) => [s.i, s.toneme, s.source, s.vowel.long])).toEqual([
      [0, null, 'lexicon', false],
      [1, 1, 'teacher', true],
      [2, 2, 'teacher', false],
    ]);
    expect(merged.accents).toEqual(authored.accents);
    expect(merged.boundaries).toEqual(authored.boundaries);
    expect(merged.orphans).toEqual([]);
  });
});
