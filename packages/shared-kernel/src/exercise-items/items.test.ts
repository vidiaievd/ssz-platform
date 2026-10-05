import { describe, expect, it } from 'vitest';

import { sampleContent, toContent, toExpectedAnswers } from '../inflection-table/index.js';
import type { InflectionTableContent } from '../inflection-table/index.js';
import {
  sampleDocument as readAloudSample,
  setMode as setReadAloudMode,
  setPrompt as setReadAloudPrompt,
  toContent as readAloudContent,
  toExpectedAnswers as readAloudAnswers,
  type ReadAloudContent,
} from '../read-aloud/index.js';
import { derivedTargetsOf, isAddressableTemplate, itemsOf } from './items.js';

/** The kernel's sample table, persisted the way content-service stores it. */
function persistedTable(overrides: Partial<InflectionTableContent> = {}) {
  const doc = sampleContent(overrides);
  return { doc, content: toContent(doc), expected: toExpectedAnswers(doc) };
}

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
  it('keys a sort item by its id and skips blank rows (plan 66)', () => {
    const content = {
      buckets: [{ id: 'b1', label: 'en', rule: '' }],
      items: [
        { id: 'i1', text: 'bil' },
        { id: 'i2', text: '  ' },
        { id: 'i3', text: 'gutt' },
      ],
    };
    const items = itemsOf('sort_into_buckets', content, { items: { i1: { bucketId: 'b1' } } });
    expect(items?.map((item) => item.key)).toEqual(['i1', 'i3']);
    expect(items?.[0]).toMatchObject({ label: 'I1 — bil', matchValues: ['bil'] });
    expect(isAddressableTemplate('sort_into_buckets')).toBe(true);
  });

  it('keys a highlight question by its id, matching the marked words (plan 67)', () => {
    const text = 'Vi reiste til Bodø. I fjor sommer gikk vi.';
    const content = {
      text,
      questions: [
        { id: 'q1', prompt: 'Marker verbene.', unit: 'word' },
        { id: 'q2', prompt: '  ', unit: 'word' },
        { id: 'q3', prompt: 'Marker tiden.', unit: 'phrase' },
      ],
    };
    const at = (w: string) => ({ start: text.indexOf(w), end: text.indexOf(w) + w.length, why: '' });
    const expected = {
      questions: {
        q1: { spans: [{ id: 's2', ...at('gikk') }, { id: 's1', ...at('reiste') }] },
        q3: { spans: [{ id: 's3', ...at('I fjor sommer') }] },
      },
    };
    const items = itemsOf('highlight_in_text', content, expected);
    expect(items?.map((item) => item.key)).toEqual(['q1', 'q3']);
    expect(items?.[0]).toMatchObject({ label: 'Q1 — Marker verbene.', matchValues: ['reiste', 'gikk'] });
    expect(items?.[1]).toMatchObject({ label: 'Q2 — Marker tiden.', matchValues: ['I fjor sommer'] });
    expect(isAddressableTemplate('highlight_in_text')).toBe(true);
  });

  it('keys a dictation sentence by its segment id, focus words first (plan 68)', () => {
    const content = {
      mode: 'segments',
      language: 'nb',
      segments: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
    };
    const expected = {
      segments: {
        s1: {
          text: 'På kjøkkenet står det en skje ved siden av tallerkenen.',
          why: '',
          focus: [
            { id: 'f2', wordIndex: 5, why: '' },
            { id: 'f1', wordIndex: 1, why: '' },
          ],
        },
        s2: { text: '   ', why: '', focus: [] },
        s3: { text: 'Hun går  til butikken.', why: '', focus: [] },
      },
      orphans: [],
    };
    const items = itemsOf('dictation', content, expected);
    expect(items?.map((item) => item.key)).toEqual(['s1', 's3']);
    expect(items?.[0]).toMatchObject({
      label: 'S1 — På kjøkkenet står det en skje ved siden…',
      value: 'På kjøkkenet står det en skje ved siden av tallerkenen.',
    });
    expect(items?.[0]?.matchValues.slice(0, 3)).toEqual(['kjøkkenet', 'skje', 'På']);
    expect(items?.[1]).toMatchObject({
      label: 'S2 — Hun går til butikken.',
      matchValues: ['Hun', 'går', 'til', 'butikken'],
    });
    expect(isAddressableTemplate('dictation')).toBe(true);
  });

  it('keys an inflection cell as rowId:slotId, asked cells only (plan 69)', () => {
    const { content, expected } = persistedTable();
    const items = itemsOf('inflection_table', content, expected);
    // Four rows, the first column given: twelve asked cells, row by row in slot order.
    expect(items).toHaveLength(12);
    expect(items?.slice(0, 3).map((item) => item.key)).toEqual(['r1:defSg', 'r1:indefPl', 'r1:defPl']);
    expect(items?.find((item) => item.key === 'r2:defSg')).toEqual({
      key: 'r2:defSg',
      label: 'bok · best. ent. — boka',
      value: 'boka',
      matchValues: ['boka', 'bok'],
    });
    expect(isAddressableTemplate('inflection_table')).toBe(true);
  });

  it('leaves out what a learner is not graded on: switched-off slots, keyless cells, lemma-less rows', () => {
    const { doc } = persistedTable();
    const [r1, r2, r3, r4] = doc.rows;
    const edited: InflectionTableContent = {
      ...doc,
      slots: ['indefSg', 'defSg', 'indefPl'],
      rows: [
        { ...r1!, cells: { ...r1!.cells, defSg: { ...r1!.cells['defSg']!, value: '' } } },
        { ...r2!, lemma: '  ' },
        r3!,
        r4!,
      ],
    };
    const items = itemsOf('inflection_table', toContent(edited), toExpectedAnswers(edited));
    expect(items?.map((item) => item.key)).toEqual([
      'r1:indefPl',
      'r3:defSg',
      'r3:indefPl',
      'r4:defSg',
      'r4:indefPl',
    ]);
  });

  it('keeps a removed row out of the keys, so a release prunes its cards (plan 69 §8 item 8)', () => {
    const { doc } = persistedTable();
    const without = { ...doc, rows: doc.rows.filter((r) => r.id !== 'r2') };
    const keys = itemsOf('inflection_table', toContent(without), toExpectedAnswers(without))?.map((i) => i.key);
    expect(keys?.some((key) => key.startsWith('r2:'))).toBe(false);
  });

  it('keys a gap exactly as gapResults spells it', () => {
    // The whole point: a target keyed differently from the evidence could never be joined
    // to it. `sentenceId#tokenIndex` is not a choice made here, it is what already travels.
    const items = itemsOf('word_bank_gap_fill', GAP_FILL_CONTENT, {});
    expect(items?.map((item) => item.key)).toEqual(['s1#1', 's1#5']);
  });

  it('labels a gap with the answer word, so the author can tell which one it is', () => {
    const items = itemsOf('word_bank_gap_fill', GAP_FILL_CONTENT, {});
    expect(items?.[0]?.label).toBe('G1 — bor');
    expect(items?.[1]?.label).toBe('G2 — huset');
  });

  it('keys a pair by its pair id', () => {
    const items = itemsOf('match_pairs', MATCH_PAIRS_CONTENT, {});
    expect(items?.map((item) => item.key)).toEqual(['p1', 'p2']);
    expect(items?.[0]?.label).toBe('P1 — Hvis det regner');
  });

  it('offers both halves of a pair for matching', () => {
    // Which half holds the word is not fixed. The seeded corpus puts names on the left and
    // the words on the right, and looking only at the left finds nothing at all.
    const items = itemsOf('match_pairs', MATCH_PAIRS_CONTENT, {});
    expect(items?.[0]?.matchValues).toEqual(['Hvis det regner', 'blir vi hjemme']);
  });

  it('offers the answer of a gap for matching', () => {
    const items = itemsOf('word_bank_gap_fill', GAP_FILL_CONTENT, {});
    expect(items?.[0]?.matchValues).toEqual(['bor']);
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

describe('derivedTargetsOf (plan 69, Q1-B)', () => {
  it('names the dictionary word of a linked row on each of its asked cells, as context', () => {
    const { content, expected } = persistedTable();
    const targets = derivedTargetsOf('inflection_table', content, expected);
    expect(targets).toHaveLength(12);
    expect(targets.filter((t) => t.itemKey.startsWith('r2:'))).toEqual([
      { itemKey: 'r2:defSg', atomType: 'vocabulary_item', atomId: 'dict-r2', role: 'context' },
      { itemKey: 'r2:indefPl', atomType: 'vocabulary_item', atomId: 'dict-r2', role: 'context' },
      { itemKey: 'r2:defPl', atomType: 'vocabulary_item', atomId: 'dict-r2', role: 'context' },
    ]);
  });

  it('derives nothing for a row typed by hand — it feeds the grammar atom only', () => {
    const { doc } = persistedTable();
    const typed = { ...doc, rows: doc.rows.map((r) => (r.id === 'r1' ? { ...r, dictId: null } : r)) };
    const targets = derivedTargetsOf('inflection_table', toContent(typed), toExpectedAnswers(typed));
    expect(targets.some((t) => t.itemKey.startsWith('r1:'))).toBe(false);
    expect(targets).toHaveLength(9);
  });

  it('addresses only cells itemsOf knows', () => {
    const { content, expected } = persistedTable();
    const keys = new Set(itemsOf('inflection_table', content, expected)?.map((i) => i.key));
    for (const target of derivedTargetsOf('inflection_table', content, expected)) {
      expect(keys.has(target.itemKey), target.itemKey).toBe(true);
    }
  });

  it('derives nothing for any other template, or a malformed document', () => {
    expect(derivedTargetsOf('sort_into_buckets', {}, {})).toEqual([]);
    expect(derivedTargetsOf('inflection_table', null, null)).toEqual([]);
    expect(derivedTargetsOf('inflection_table', { rows: 'not an array' }, {})).toEqual([]);
  });
});

describe('read_aloud (plan 70)', () => {
  const items = (ex: ReadAloudContent) => itemsOf('read_aloud', readAloudContent(ex), readAloudAnswers(ex));

  it('addresses each prompt by its id, focus words first among the words to match', () => {
    expect(isAddressableTemplate('read_aloud')).toBe(true);
    const [first, second] = items(readAloudSample())!;
    expect(first!.key).toBe('p1aaaa');
    expect(first!.label.startsWith('Avsnitt 1 — Jeg søkte på jobben')).toBe(true);
    expect(first!.matchValues.slice(0, 3)).toEqual(['søkte', 'Kjetil', 'Kirkegata']);
    expect(second!.key).toBe('p2bbbb');
  });

  it('leaves out a prompt with nothing to record and reads the material of the mode', () => {
    const dialogue = setReadAloudPrompt(setReadAloudMode(readAloudSample(), 'dialogue'), 'p1aaaa', {
      label: '',
      turn: { situation: '', partner: 'Hva kan jeg hjelpe deg med?' },
    });
    const out = items(dialogue)!;
    expect(out.map((i) => i.key)).toEqual(['p1aaaa']);
    expect(out[0]!.label).toBe('P1 — Hva kan jeg hjelpe deg med?');
    expect(out[0]!.matchValues).not.toContain('søkte');
  });
});
