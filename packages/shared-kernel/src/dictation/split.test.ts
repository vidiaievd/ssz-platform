import { describe, expect, it } from 'vitest';

import { EMPTY_PACK, packOf } from './presets.js';
import { sentencesOf, splitTranscript } from './split.js';

const nb = packOf('nb');

describe('paste and split (AC-B2)', () => {
  it('one segment per sentence', () => {
    expect(sentencesOf('Vi kom hjem. Hun sa ja! Og så?  Ferdig…', nb)).toEqual([
      'Vi kom hjem.',
      'Hun sa ja!',
      'Og så?',
      'Ferdig…',
    ]);
  });

  it('a line break always splits; without a pack it is the only break', () => {
    expect(sentencesOf('En. To.\nTre.', EMPTY_PACK)).toEqual(['En. To.', 'Tre.']);
  });

  it('estimates timecodes from each sentence’s share of the words and says so', () => {
    const r = splitTranscript('En to tre. Fire.', 20, nb);
    expect(r.segments.map((s) => s.audio)).toEqual([
      { start: 0, end: 15 },
      { start: 15, end: 20 },
    ]);
    expect(r.estimated).toEqual(r.segments.map((s) => s.id));
  });

  it('no clip length → no timecodes and nothing estimated', () => {
    const r = splitTranscript('En. To.', 0, nb);
    expect(r.segments.every((s) => s.audio === null)).toBe(true);
    expect(r.estimated).toEqual([]);
  });
});
