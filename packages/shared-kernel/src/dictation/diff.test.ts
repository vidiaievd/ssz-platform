// SPEC_data_model §4, AC-M1 – AC-M11. The fixture is the one the engine's suite runs too.

import { describe, expect, it } from 'vitest';

import { diff, passes } from './diff.js';
import { DIFF_FIXTURE, opSignature } from './fixture.js';
import { DEFAULT_MARKING } from './model.js';
import { EMPTY_PACK, packOf } from './presets.js';

const nb = packOf('nb');
const M = DEFAULT_MARKING;

describe('diff — the shared fixture (AC-M1)', () => {
  it.each(DIFF_FIXTURE.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const r = diff(c.expected, c.typed, { ...M, ...c.marking }, c.focus, packOf(c.language));
    expect(r.ops.map(opSignature)).toEqual(c.ops);
    expect(r.words).toEqual(c.words);
    expect(r.num2).toBe(c.num2);
  });
});

describe('diff — the criteria one by one', () => {
  it('AC-M8: half a word for one near miss in ten → 95%', () => {
    const r = diff(
      'a b c d e f g h i tallerken',
      'a b c d e f g h i talerken',
      { ...M, near: 'half' },
      [],
      nb,
    );
    expect(r.score).toBeCloseTo(0.95);
  });

  it('AC-M10: an empty answer is 0 with no NaN, every word missing', () => {
    const r = diff('Vi hadde ikke hørt noe.', '', M, [], nb);
    expect(r.score).toBe(0);
    expect(r.words.missing).toBe(5);
    expect(Number.isNaN(r.score)).toBe(false);
  });

  it('an empty key scores 0, not NaN', () => {
    expect(diff('', 'noe', M, [], nb).score).toBe(0);
  });

  it('AC-M11: double spaces, a line break and a trailing space change nothing', () => {
    const clean = diff('Vi hadde ikke hørt noe.', 'Vi hadde ikke hørt noe.', M, [], nb);
    const messy = diff('Vi hadde ikke hørt noe.', '  Vi  hadde\n ikke hørt noe.  ', M, [], nb);
    expect(messy.score).toBe(clean.score);
  });

  it('a decomposed å from a phone keyboard is the same letter (NFC)', () => {
    const r = diff('Vi går hjem.', 'Vi går hjem.', M, [], nb);
    expect(r.words.exact).toBe(3);
  });

  it('the score never goes below zero', () => {
    expect(diff('to ord', 'helt andre fire ord her', M, [], nb).score).toBe(0);
  });

  it('pairs a whole seam in order: two substitutions in a row', () => {
    const r = diff('Hytta ligger mellom fjellet.', 'Hyta liger mellom fjellet.', M, [], nb);
    expect(r.ops.map(opSignature)).toEqual([
      '~Hyta>Hytta:typo!',
      '~liger>ligger:typo!',
      '=mellom',
      '=fjellet',
    ]);
  });

  it('a boundary error on a focus word is a focus miss and never near', () => {
    const r = diff('Vi kom i går.', 'Vi kom igår.', { ...M, near: 'half' }, [3], nb);
    const sub = r.ops.find((o) => o.k === 'sub');
    expect(sub).toMatchObject({ cls: 'boundary', near: false, focus: true, n: 2 });
  });

  it('without a pack nothing folds: paa for på is a plain wrong word', () => {
    const r = diff('på', 'paa', M, [], EMPTY_PACK);
    expect(r.ops[0]).toMatchObject({ k: 'sub', cls: 'wrong', near: false });
  });

  it('a pack that accepts a spelling makes it equal (AC-X8 — data, not code)', () => {
    const pack = { ...EMPTY_PACK, accepted: { æ: ['ae'] } };
    expect(diff('Det er være.', 'Det er vaere.', M, [], pack).words.exact).toBe(3);
  });

  it('a typo needs a target of four letters', () => {
    expect(diff('Vi bor her.', 'Vi bur her.', M, [], nb).ops[1]).toMatchObject({ cls: 'wrong' });
  });

  it('is deterministic', () => {
    const a = diff('På kjøkkenet står det en skje.', 'paa sjøkkenet står en sje det', M, [1], nb);
    const b = diff('På kjøkkenet står det en skje.', 'paa sjøkkenet står en sje det', M, [1], nb);
    expect(a).toEqual(b);
  });
});

describe('passes', () => {
  it('decides in whole numbers: 8 of 10 passes an 80% mark', () => {
    const r = diff('a b c d e f g h i j', 'a b c d e f g h x y', M, [], nb);
    expect(r.words.exact).toBe(8);
    expect(passes(r, 80)).toBe(true);
    expect(passes(r, 85)).toBe(false);
  });

  it('an empty key never passes', () => {
    expect(passes(diff('', '', M, [], nb), 50)).toBe(false);
  });
});
