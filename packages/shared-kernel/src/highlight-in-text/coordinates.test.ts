import { describe, expect, it } from 'vitest';

import {
  clampToParagraph,
  isOnTokens,
  mergeRuns,
  paragraphOfTokens,
  snapMarks,
  toCharRange,
  toTokenRun,
} from './coordinates.js';
import { SAMPLE_TEXT, spanAt } from './fixtures.test-support.js';
import { tokenize } from './tokenize.js';

const tokens = tokenize(SAMPLE_TEXT);
const indexOf = (word: string, nth = 1) => tokens.filter((t) => t.w === word)[nth - 1]?.i ?? -1;

describe('toTokenRun / toCharRange', () => {
  it('AC-M2: a mark over «Bodø,» is stored over «Bodø» — the comma is left out', () => {
    const start = SAMPLE_TEXT.indexOf('Bodø,');
    const run = toTokenRun(tokens, { start, end: start + 'Bodø,'.length });
    expect(run).toEqual({ t0: indexOf('Bodø'), t1: indexOf('Bodø') });
    const range = toCharRange(tokens, run!);
    expect(SAMPLE_TEXT.slice(range.start, range.end)).toBe('Bodø');
  });

  it('takes a whole word when a range cuts it in half', () => {
    const start = SAMPLE_TEXT.indexOf('reiste') + 2;
    const run = toTokenRun(tokens, { start, end: start + 2 });
    expect(run).toEqual({ t0: indexOf('reiste'), t1: indexOf('reiste') });
  });

  it('keeps the punctuation between the tokens of a run', () => {
    const range = toCharRange(tokens, { t0: indexOf('Bodø'), t1: indexOf('og') });
    expect(SAMPLE_TEXT.slice(range.start, range.end)).toBe('Bodø, og');
  });

  it('returns null for a range over punctuation, an empty range and an inverted one', () => {
    const comma = SAMPLE_TEXT.indexOf(',');
    expect(toTokenRun(tokens, { start: comma, end: comma + 1 })).toBeNull();
    expect(toTokenRun(tokens, { start: 5, end: 5 })).toBeNull();
    expect(toTokenRun(tokens, { start: 9, end: 3 })).toBeNull();
  });

  it('isOnTokens accepts a stored span and refuses one off the word edges', () => {
    const span = spanAt(SAMPLE_TEXT, 'reiste');
    expect(isOnTokens(tokens, span)).toBe(true);
    expect(isOnTokens(tokens, { start: span.start, end: span.end + 1 })).toBe(false);
    expect(isOnTokens(tokens, { start: span.start + 1, end: span.end })).toBe(false);
  });
});

describe('paragraphs', () => {
  const paragraphOf = paragraphOfTokens(SAMPLE_TEXT, tokens);

  it('puts each token in its paragraph', () => {
    expect(paragraphOf[indexOf('kraftig')]).toBe(0);
    expect(paragraphOf[indexOf('bodde')]).toBe(1);
  });

  it('cuts a run at the paragraph of its origin, whichever end the origin is', () => {
    const last = indexOf('kraftig');
    const next = indexOf('bodde');
    expect(clampToParagraph(paragraphOf, last - 1, next)).toEqual({ t0: last - 1, t1: last });
    expect(clampToParagraph(paragraphOf, next, last - 1)).toEqual({ t0: next - 1, t1: next });
  });
});

describe('mergeRuns', () => {
  it('AC-G6: merges runs that share a token', () => {
    expect(mergeRuns([{ t0: 4, t1: 6 }, { t0: 1, t1: 2 }, { t0: 5, t1: 9 }])).toEqual([
      { t0: 1, t1: 2 },
      { t0: 4, t1: 9 },
    ]);
  });

  it('keeps touching runs apart — two adjacent marks are two answers', () => {
    expect(mergeRuns([{ t0: 1, t1: 2 }, { t0: 3, t1: 3 }])).toEqual([
      { t0: 1, t1: 2 },
      { t0: 3, t1: 3 },
    ]);
  });
});

describe('snapMarks', () => {
  it('snaps, cuts at the paragraph and merges', () => {
    const a = spanAt(SAMPLE_TEXT, 'hele uka');
    const b = spanAt(SAMPLE_TEXT, 'uka');
    const r = snapMarks(SAMPLE_TEXT, [a, b]);
    expect(r).toEqual({ ok: true, runs: [{ t0: indexOf('hele'), t1: indexOf('uka') }] });
  });

  it('cuts a mark that runs into the next paragraph', () => {
    const start = SAMPLE_TEXT.indexOf('kraftig');
    const end = SAMPLE_TEXT.indexOf('bodde') + 'bodde'.length;
    const r = snapMarks(SAMPLE_TEXT, [{ start, end }]);
    expect(r).toEqual({ ok: true, runs: [{ t0: indexOf('kraftig'), t1: indexOf('kraftig') }] });
  });

  it('AC-G7: a mark covering no token refuses the whole submission', () => {
    const comma = SAMPLE_TEXT.indexOf(',');
    const r = snapMarks(SAMPLE_TEXT, [spanAt(SAMPLE_TEXT, 'reiste'), { start: comma, end: comma + 1 }]);
    expect(r).toEqual({ ok: false, code: 'HT_MARK_UNSNAPPABLE', index: 1 });
  });
});
