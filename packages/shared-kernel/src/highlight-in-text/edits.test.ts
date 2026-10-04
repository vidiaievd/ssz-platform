// BEHAVIOR §3 and DECISIONS §1 — the cascades step 2 runs.

import { describe, expect, it } from 'vitest';

import {
  addQuestion,
  applyText,
  canAddQuestion,
  clearMarks,
  removeQuestion,
  removeSpan,
  resizeMark,
  setSpanWhy,
  setUnit,
  toggleMark,
} from './edits.js';
import { exercise, question, SAMPLE_TEXT } from './fixtures.test-support.js';
import type { HighlightInTextContent } from './model.js';
import { HT_MAX_Q } from './model.js';
import { tokenize } from './tokenize.js';

const tokens = tokenize(SAMPLE_TEXT);
const at = (word: string, nth = 1) => tokens.filter((t) => t.w === word)[nth - 1]!.i;

/** The sample passage with one empty question of the given unit. */
const blank = (unit: 'word' | 'phrase'): HighlightInTextContent => ({
  ...exercise(),
  questions: [question('q', { unit })],
});

const marked = (ex: HighlightInTextContent) =>
  ex.questions[0]!.spans.map((s) => ex.text.slice(s.start, s.end));

describe('toggleMark', () => {
  it('a click marks one token and reports the new span', () => {
    const r = toggleMark(blank('word'), 'q', at('reiste'), at('reiste'));
    expect(marked(r.ex)).toEqual(['reiste']);
    expect(r.added).toBe(r.ex.questions[0]!.spans[0]!.id);
  });

  it('AC-M3: with unit word, a drag across three tokens marks the drag origin only', () => {
    const r = toggleMark(blank('word'), 'q', at('reiste'), at('reiste') + 2);
    expect(marked(r.ex)).toEqual(['reiste']);
  });

  it('AC-S3 (author side): with unit phrase, a drag marks exactly the run', () => {
    const r = toggleMark(blank('phrase'), 'q', at('den'), at('dagen'));
    expect(marked(r.ex)).toEqual(['den siste dagen']);
  });

  it('a drag backwards marks the same run', () => {
    const r = toggleMark(blank('phrase'), 'q', at('dagen'), at('den'));
    expect(marked(r.ex)).toEqual(['den siste dagen']);
  });

  it('AC-S2 (author side): a click on a marked token removes the whole span', () => {
    const one = toggleMark(blank('phrase'), 'q', at('den'), at('dagen')).ex;
    const r = toggleMark(one, 'q', at('siste'), at('siste'));
    expect(marked(r.ex)).toEqual([]);
    expect(r.added).toBeNull();
  });

  it('a drag across existing marks replaces them with one', () => {
    let ex = toggleMark(blank('phrase'), 'q', at('hele'), at('hele')).ex;
    ex = toggleMark(ex, 'q', at('uka'), at('uka')).ex;
    ex = toggleMark(ex, 'q', at('hele'), at('uka')).ex;
    expect(marked(ex)).toEqual(['hele uka']);
  });

  it('a drag stops at the paragraph its origin is in', () => {
    const r = toggleMark(blank('phrase'), 'q', at('kraftig'), at('bodde'));
    expect(marked(r.ex)).toEqual(['kraftig']);
  });

  it('keeps the spans in text order', () => {
    let ex = toggleMark(blank('word'), 'q', at('spiste'), at('spiste')).ex;
    ex = toggleMark(ex, 'q', at('reiste'), at('reiste')).ex;
    expect(marked(ex)).toEqual(['reiste', 'spiste']);
  });

  it('ignores an unknown question or token', () => {
    const ex = blank('word');
    expect(toggleMark(ex, 'nope', 0, 0).ex).toBe(ex);
    expect(toggleMark(ex, 'q', 9999, 9999).ex).toBe(ex);
  });
});

describe('resizeMark (Shift+Arrow)', () => {
  const start = () => toggleMark(blank('phrase'), 'q', at('den'), at('den'));

  it('grows and shrinks the mark at its far end', () => {
    const { ex, added } = start();
    const grown = resizeMark(resizeMark(ex, 'q', added!, 1), 'q', added!, 1);
    expect(marked(grown)).toEqual(['den siste dagen']);
    expect(marked(resizeMark(grown, 'q', added!, -1))).toEqual(['den siste']);
  });

  it('never shrinks below one token', () => {
    const { ex, added } = start();
    expect(resizeMark(ex, 'q', added!, -1)).toBe(ex);
  });

  it('does not run into another mark or across a paragraph', () => {
    let ex = toggleMark(blank('phrase'), 'q', at('siste'), at('siste')).ex;
    const r = toggleMark(ex, 'q', at('den'), at('den'));
    ex = r.ex;
    expect(resizeMark(ex, 'q', r.added!, 1)).toBe(ex);

    const end = toggleMark(blank('phrase'), 'q', at('kraftig'), at('kraftig'));
    expect(resizeMark(end.ex, 'q', end.added!, 1)).toBe(end.ex);
  });

  it('is a no-op on a word question', () => {
    const { ex, added } = toggleMark(blank('word'), 'q', at('den'), at('den'));
    expect(resizeMark(ex, 'q', added!, 1)).toBe(ex);
  });
});

describe('questions', () => {
  it('AC-A3: adding stops at the ceiling of four', () => {
    let ex = blank('word');
    for (let i = 0; i < 6; i++) ex = addQuestion(ex);
    expect(ex.questions).toHaveLength(HT_MAX_Q);
    expect(canAddQuestion(ex)).toBe(false);
  });

  it('AC-A6: deleting a question deletes its marks and its orphans', () => {
    const ex = {
      ...exercise(),
      orphans: [
        { id: 'o1', qid: 'q1', surface: 'x', why: '' },
        { id: 'o2', qid: 'q2', surface: 'y', why: '' },
      ],
    };
    const next = removeQuestion(ex, 'q1');
    expect(next.questions.map((q) => q.id)).toEqual(['q2']);
    expect(next.orphans.map((o) => o.id)).toEqual(['o2']);
  });

  it('switching to single words never truncates a phrase mark', () => {
    const ex = exercise();
    const next = setUnit(ex, 'q2', 'word');
    expect(next.questions[1]!.unit).toBe('word');
    expect(next.questions[1]!.spans).toEqual(ex.questions[1]!.spans);
  });
});

describe('marks', () => {
  it('removes one span, clears all, writes a reason', () => {
    const ex = exercise();
    expect(removeSpan(ex, 'q1', 'tok').questions[0]!.spans.map((s) => s.id)).not.toContain('tok');
    expect(clearMarks(ex, 'q1').questions[0]!.spans).toEqual([]);
    expect(setSpanWhy(ex, 'q1', 'tok', 'ta — tok').questions[0]!.spans.find((s) => s.id === 'tok')!.why).toBe('ta — tok');
  });

  it('applyText is a re-anchor', () => {
    const ex = exercise();
    const next = applyText(ex, ex.text.replace('hurtigbåten', 'båten'));
    expect(next.text).toContain('båten');
    expect(next.orphans).toEqual([]);
  });
});
