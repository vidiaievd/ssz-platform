import { describe, expect, it } from 'vitest';

import { isAddressableTemplate, itemsOf } from './items.js';

// A minimal gap-fill as it is persisted: one sentence, two gaps on token indices 2 and 4.
const GAP_FILL_CONTENT = {
  sentences: [{ id: 's1', text: 'Vi bor i det store huset', gaps: [1, 5] }],
  distractors: [],
  settings: {
    shuffle: true,
    allowReuse: false,
    showBankCount: true,
    caseSensitive: false,
    input: 'bank',
  },
};

const MATCH_PAIRS_CONTENT = {
  variant: 'pairs',
  pairs: [
    { id: 'p1', rightId: 'r1', left: 'Hvis det regner', right: 'blir vi hjemme' },
    { id: 'p2', rightId: 'r2', left: 'Når hun kommer', right: 'spiser vi' },
  ],
  distractors: [],
  settings: {},
};

describe('itemsOf', () => {
  it('keys a gap exactly as gapResults spells it', () => {
    // The whole point: a target keyed differently from the evidence could never be joined
    // to it. `sentenceId#tokenIndex` is not a choice made here, it is what already travels.
    const items = itemsOf('word_bank_gap_fill', GAP_FILL_CONTENT, {});
    expect(items?.map((item) => item.key)).toEqual(['s1#1', 's1#5']);
  });

  it('labels a gap with the answer word, so the author can tell which one it is', () => {
    const items = itemsOf('word_bank_gap_fill', GAP_FILL_CONTENT, {});
    expect(items?.[0].label).toBe('G1 — bor');
    expect(items?.[1].label).toBe('G2 — huset');
  });

  it('keys a pair by its pair id', () => {
    const items = itemsOf('match_pairs', MATCH_PAIRS_CONTENT, {});
    expect(items?.map((item) => item.key)).toEqual(['p1', 'p2']);
    expect(items?.[0].label).toBe('P1 — Hvis det regner');
  });

  it('answers null for a template that grades as a whole', () => {
    // Not an empty array: "this type cannot be addressed inside" and "this document has no
    // pieces yet" are different sentences, and the builder says different things about them.
    expect(itemsOf('writing_task', {}, {})).toBeNull();
    expect(itemsOf('short_answer', {}, {})).toBeNull();
  });

  it('answers an empty list for an addressable template with nothing in it', () => {
    const empty = { ...GAP_FILL_CONTENT, sentences: [] };
    expect(itemsOf('word_bank_gap_fill', empty, {})).toEqual([]);
  });

  it('survives a malformed document — an editing screen sees half-written ones', () => {
    expect(itemsOf('word_bank_gap_fill', { sentences: 'not an array' }, {})).toEqual([]);
    expect(itemsOf('match_pairs', null, null)).toEqual([]);
  });

  it('skips a gap whose token the sentence no longer has', () => {
    // The residue of an edit: the index outlives the token. Reporting it would put a gap
    // onto nothing in front of the author.
    const edited = {
      ...GAP_FILL_CONTENT,
      sentences: [{ id: 's1', text: 'Vi bor', gaps: [1, 5] }],
    };
    expect(itemsOf('word_bank_gap_fill', edited, {})?.map((i) => i.key)).toEqual(['s1#1']);
  });
});

describe('isAddressableTemplate', () => {
  it('knows the two templates that publish per-item verdicts', () => {
    expect(isAddressableTemplate('word_bank_gap_fill')).toBe(true);
    expect(isAddressableTemplate('match_pairs')).toBe(true);
    expect(isAddressableTemplate('writing_task')).toBe(false);
  });
});
