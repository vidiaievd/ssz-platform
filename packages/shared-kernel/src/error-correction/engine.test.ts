import { describe, expect, it } from 'vitest';

import type { Check, Item, StudentEdits } from './model.js';
import { DEFAULT_CHECK, EMPTY_EDITS } from './model.js';
import {
  align,
  build,
  coverage,
  expandRef,
  hardSpans,
  inferType,
  judge,
  route,
  spans,
  typoEq,
  variants,
  words,
} from './engine.js';

const check: Check = { ...DEFAULT_CHECK };

function item(wrong: string, ref: string, overrides: Partial<Item> = {}): Item {
  return { id: 'i1', wrong, ref, alts: [], meta: {}, ...overrides };
}

/** Student edits, written the way the runner stores them. */
function edits(
  marked: Record<number, boolean> = {},
  fix: Record<number, string> = {},
  ins: Record<number, string> = {},
): StudentEdits {
  return { marked, fix, ins };
}

describe('expandRef', () => {
  it('expands one alternation into two acceptable sentences', () => {
    expect(expandRef('Jeg (liker|elsker) det')).toEqual(['Jeg liker det', 'Jeg elsker det']);
  });

  it('makes a word optional with an empty branch', () => {
    expect(expandRef('Jeg kommer (nå|)')).toEqual(['Jeg kommer nå', 'Jeg kommer']);
  });

  it('multiplies out two groups', () => {
    expect(expandRef('(Jeg|Du) (liker|elsker) det')).toHaveLength(4);
  });

  it('is empty for an unwritten key, which is what makes a verdict of noref possible', () => {
    expect(expandRef('   ')).toEqual([]);
  });
});

describe('align', () => {
  it('reports a word only in the faulty sentence as extra, and only in the key as missing', () => {
    const { ops, edits: count } = align(words('Vi må å snakke'), words('Vi må snakke'), check);

    expect(ops.map((op) => op.t)).toEqual(['eq', 'eq', 'extra', 'eq']);
    expect(count).toBe(1);
  });

  it('scores identical sentences 1.0', () => {
    expect(align(words('Vi må snakke'), words('Vi må snakke'), check).sim).toBe(1);
  });

  it('marks an eq op as a typo when the words were close but not identical', () => {
    const { ops } = align(words('Hun snakkr norsk'), words('Hun snakker norsk'), check);

    expect(ops.every((op) => op.t === 'eq')).toBe(true);
    expect(ops[1]?.typo).toBe('snakker');
  });

  it('is one letter, not one swap: short words and transpositions are not typos', () => {
    expect(typoEq('om', 'og')).toBe(false);
    expect(typoEq('bestile', 'bestille')).toBe(true);
    // Two letters trading places is two differences, and the handoff's rule counts one.
    expect(typoEq('snakekr', 'snakker')).toBe(false);
  });
});

describe('spans', () => {
  it('merges a swap around a matching word into one word-order mistake', () => {
    const found = spans(item('I går jeg gikk på kino.', 'I går gikk jeg på kino.'), check);

    expect(found).toHaveLength(1);
    expect(found[0]?.type).toBe('order');
    expect(found[0]?.wrong).toBe('jeg gikk');
    expect(found[0]?.fix).toBe('gikk jeg');
  });

  it('reads an ending change as inflection, not spelling', () => {
    const found = spans(item('Hun har bodde i Bergen.', 'Hun har bodd i Bergen.'), check);

    expect(found).toHaveLength(1);
    expect(found[0]?.type).toBe('form');
  });

  it('calls a superfluous word extra and points at an empty fix', () => {
    const found = spans(item('Vi må å snakke sammen.', 'Vi må snakke sammen.'), check);

    expect(found[0]?.type).toBe('extra');
    expect(found[0]?.fix).toBe('');
  });

  it('calls a wrong preposition a function-word mistake', () => {
    const found = spans(
      item('Jeg interesserer meg om historie.', 'Jeg interesserer meg for historie.'),
      check,
    );

    expect(found[0]?.type).toBe('function');
  });

  it('marks a missing word as an insertion point', () => {
    const found = spans(item('Vi snakke sammen.', 'Vi må snakke sammen.'), check);

    expect(found).toHaveLength(1);
    expect(found[0]?.type).toBe('missing');
    expect(found[0]?.wFrom).toBe(found[0]?.wTo);
    expect(found[0]?.fix).toBe('må');
  });

  it('reads the author lines literally — a one-letter mistake is a span, not a match', () => {
    const found = spans(item('Vi vil bestile mat.', 'Vi vil bestille mat.'), { ...check, typo: true });

    expect(found).toHaveLength(1);
    expect(found[0]?.type).toBe('spelling');
  });

  it('applies the author override keyed by the derived span key', () => {
    const base = spans(item('Vi må å snakke sammen.', 'Vi må snakke sammen.'), check);
    const key = base[0]!.key;

    const overridden = spans(
      item('Vi må å snakke sammen.', 'Vi må snakke sammen.', {
        meta: { [key]: { type: 'function', note: 'Modalverb tar infinitiv uten «å».' } },
      }),
      check,
    );

    expect(overridden[0]?.type).toBe('function');
    expect(overridden[0]?.note).toBe('Modalverb tar infinitiv uten «å».');
  });

  it('drops an override whose span no longer exists', () => {
    const found = spans(
      item('Vi må snakke sammen.', 'Vi må snakke sammen i dag.', {
        meta: { '2:3:snakke': { note: 'stale' } },
      }),
      check,
    );

    expect(found.every((span) => span.note === '')).toBe(true);
  });

  it('keeps a soft span out of every count the student sees', () => {
    const written = item('Jeg har bodde her.', 'Jeg har bodd her.');
    const key = spans(written, check)[0]!.key;
    const soft = { ...written, meta: { [key]: { soft: true } } };

    expect(spans(soft, check)).toHaveLength(1);
    expect(hardSpans(soft, check)).toHaveLength(0);
  });

  it('derives nothing when there is no answer key', () => {
    expect(spans(item('Jeg har bodde her.', ''), check)).toEqual([]);
  });
});

describe('inferType', () => {
  it('is order only when the same words come back in another sequence', () => {
    expect(inferType(['jeg', 'gikk'], ['gikk', 'jeg'])).toBe('order');
  });

  it('is spelling when one letter inside a long word differs', () => {
    expect(inferType(['bestile'], ['bestille'])).toBe('spelling');
  });
});

describe('build', () => {
  it('is the untouched sentence when nothing was edited', () => {
    expect(build(item('Vi må å snakke.', 'Vi må snakke.'), EMPTY_EDITS)).toBe('Vi må å snakke.');
  });

  it('strikes a word out on an empty fix', () => {
    expect(build(item('Vi må å snakke.', 'Vi må snakke.'), edits({ 2: true }, { 2: '' }))).toBe(
      'Vi må snakke.',
    );
  });

  it('inserts at a slot between two words', () => {
    expect(build(item('Vi snakke.', 'Vi må snakke.'), edits({}, {}, { 1: 'må' }))).toBe(
      'Vi må snakke.',
    );
  });

  it('keeps the word when it was marked but never rewritten', () => {
    expect(build(item('Vi må snakke.', 'Vi må snakke.'), edits({ 1: true }))).toBe('Vi må snakke.');
  });
});

describe('judge', () => {
  const inversion = item('I går jeg gikk på kino.', 'I går gikk jeg på kino.');

  it('is empty before the student touches anything', () => {
    const judged = judge(check, inversion, EMPTY_EDITS);

    expect(judged.verdict).toBe('empty');
    expect(judged.fixedCount).toBe(0);
  });

  it('is exact when the built sentence matches the key', () => {
    const judged = judge(check, inversion, edits({ 2: true, 3: true }, { 2: 'gikk', 3: 'jeg' }));

    expect(judged.verdict).toBe('exact');
    expect(judged.fixedCount).toBe(1);
    expect(judged.spanCount).toBe(1);
    expect(judged.built).toBe('I går gikk jeg på kino.');
  });

  it('is noref while the author has written no key', () => {
    expect(judge(check, item('Vi må å snakke.', ''), EMPTY_EDITS).verdict).toBe('noref');
  });

  it('is partial when one of two mistakes is corrected', () => {
    const two = item('Hun har bodde i Bergen og jeg interesserer meg om det.',
      'Hun har bodd i Bergen og jeg interesserer meg for det.');
    const judged = judge(check, two, edits({ 2: true }, { 2: 'bodd' }));

    expect(judged.spanCount).toBe(2);
    expect(judged.fixedCount).toBe(1);
    expect(judged.verdict).toBe('partial');
  });

  it('is off when nothing was corrected and the sentence drifted away from the key', () => {
    const judged = judge(check, inversion, edits({ 0: true, 1: true }, { 0: 'Hallo', 1: 'der' }));

    expect(judged.verdict).toBe('off');
  });

  it('names an edit outside every mistake as stray', () => {
    const judged = judge(
      check,
      inversion,
      edits({ 2: true, 3: true, 5: true }, { 2: 'gikk', 3: 'jeg', 5: 'teater' }),
    );

    expect(judged.stray).toEqual([{ kind: 'edit', index: 5, word: 'kino.' }]);
  });

  // An answer can be exact *and* carry a stray edit only when normalisation forgives the
  // stray one — here the student also swapped the full stop for an exclamation mark.
  it('turns exact into stray only when the setting blocks stray edits', () => {
    const forgiving: Check = { ...check, ignorePunct: true };
    const strayEdit = edits({ 2: true, 3: true, 5: true }, { 2: 'gikk', 3: 'jeg', 5: 'kino!' });

    expect(judge({ ...forgiving, strayEdits: 'flag' }, inversion, strayEdit).verdict).toBe('exact');
    expect(judge({ ...forgiving, strayEdits: 'block' }, inversion, strayEdit).verdict).toBe('stray');
  });

  it('accepts a variant from alts as exact', () => {
    const withAlt = item('Jeg interesserer meg om historie.', 'Jeg interesserer meg for historie.', {
      alts: ['Jeg er interessert i historie.'],
    });
    const judged = judge(
      check,
      withAlt,
      edits({ 1: true, 2: true, 3: true }, { 1: 'er', 2: 'interessert', 3: 'i' }),
    );

    expect(judged.verdict).toBe('exact');
    expect(judged.ref).toBe('Jeg er interessert i historie.');
  });

  it('ignores a soft span when counting what is left to fix', () => {
    const written = item('Jeg har bodde her.', 'Jeg har bodd her.');
    const key = spans(written, check)[0]!.key;
    const judged = judge(check, { ...written, meta: { [key]: { soft: true } } }, EMPTY_EDITS);

    expect(judged.spanCount).toBe(0);
  });
});

describe('route', () => {
  const inversion = item('I går jeg gikk på kino.', 'I går gikk jeg på kino.');
  const solved = edits({ 2: true, 3: true }, { 2: 'gikk', 3: 'jeg' });

  it('passes an exact answer', () => {
    expect(route(check, judge(check, inversion, solved))).toBe('pass');
  });

  it('never passes anything short of exact — a typo goes to the teacher', () => {
    const nearly = edits({ 2: true, 3: true }, { 2: 'gikk', 3: 'jei' });
    const judged = judge(check, inversion, nearly);

    expect(judged.verdict).not.toBe('exact');
    expect(route(check, judged)).toBe('teacher');
  });

  it('sends an exact answer with a stray edit to the teacher unless stray edits are ignored', () => {
    const forgiving: Check = { ...check, ignorePunct: true };
    const withStray = edits({ 2: true, 3: true, 5: true }, { 2: 'gikk', 3: 'jeg', 5: 'kino!' });

    expect(route(forgiving, judge(forgiving, inversion, withStray))).toBe('teacher');

    const ignoring: Check = { ...forgiving, strayEdits: 'ignore' };
    expect(route(ignoring, judge(ignoring, inversion, withStray))).toBe('pass');
  });

  it('sends everything to the teacher when the auto-check is off', () => {
    expect(route({ ...check, on: false }, judge(check, inversion, solved))).toBe('teacher');
  });

  it('sends everything to the teacher when exactPass is off', () => {
    expect(route({ ...check, exactPass: false }, judge(check, inversion, solved))).toBe('teacher');
  });
});

describe('variants and coverage', () => {
  it('lists the key first, then the alternatives', () => {
    const written = item('a', 'Riktig setning.', { alts: ['Annen riktig setning.'] });

    expect(variants(written)).toEqual(['Riktig setning.', 'Annen riktig setning.']);
  });

  it('counts mistakes by type and how many carry an explanation', () => {
    const written = item('Vi må å snakke sammen.', 'Vi må snakke sammen.');
    const key = spans(written, check)[0]!.key;

    const summary = coverage({
      mode: 'sentences',
      note: '',
      items: [{ ...written, meta: { [key]: { note: 'Modalverb.' } } }],
      hints: { count: true, mark: false, hintText: true, showType: false },
      check,
      flow: { selfCheck: 2, attempts: 'free', showRefs: 'afterGraded', keyboard: true, perSentence: false, showSpanCount: true },
      ai: { on: false, checks: { explainWhy: false, altFixes: false, register: false }, visibility: 'teacher' },
    });

    expect(summary).toMatchObject({ items: 1, errors: 1, withRef: 1, explained: 1, singleError: 1 });
    expect(summary.byType).toEqual({ extra: 1 });
  });
});
