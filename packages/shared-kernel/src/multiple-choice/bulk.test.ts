// BEHAVIOR.md §"Step 1" — the paste parser.

import { describe, expect, it } from 'vitest';

import { parseBulk } from './bulk.js';

describe('parseBulk', () => {
  it('reads a stem and its options, with * marking the key', () => {
    const [q] = parseBulk('Hva er riktig? | skal ikke | *skal | jeg skal');

    expect(q!.stem).toBe('Hva er riktig?');
    expect(q!.options.map((o) => o.text)).toEqual(['skal ikke', 'skal', 'jeg skal']);
    expect(q!.options.filter((o) => o.correct).map((o) => o.text)).toEqual(['skal']);
  });

  it('makes the first option the key when nothing is starred', () => {
    const [q] = parseBulk('Hva er riktig? | skal | skal ikke');
    expect(q!.options[0]!.correct).toBe(true);
  });

  it('turns a line with no pipe into a stem with two empty options', () => {
    const [q] = parseBulk('Han sa at han ___ syk.');
    expect(q!.options).toHaveLength(2);
    expect(q!.options.every((o) => o.text === '' && !o.correct)).toBe(true);
  });

  it('skips blank lines and mints distinct ids', () => {
    const parsed = parseBulk('A | *x | y\n\n  \nB | *p | q');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.id).not.toBe(parsed[1]!.id);
    expect(new Set(parsed.flatMap((q) => q.options.map((o) => o.id))).size).toBe(4);
  });
});
