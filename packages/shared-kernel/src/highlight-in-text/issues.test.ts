// SPEC_data_model §5 — every code fires on its own broken document and on no other.

import { describe, expect, it } from 'vitest';

import { toggleMark } from './edits.js';
import { codes, exercise, question, spanAt } from './fixtures.test-support.js';
import { issues, isReady, stepState } from './issues.js';
import type { HighlightInTextContent } from './model.js';
import { emptyContent } from './model.js';
import { tokenize } from './tokenize.js';

const words = (n: number) => Array.from({ length: n }, (_, i) => `ord${i}`).join(' ');

const withQ = (ex: HighlightInTextContent, qid: string, patch: Partial<HighlightInTextContent['questions'][number]>) => ({
  ...ex,
  questions: ex.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)),
});

describe('the reference document', () => {
  it('raises nothing', () => {
    expect(issues(exercise())).toEqual([]);
    expect(isReady(exercise())).toBe(true);
  });
});

describe('step 1 — the text', () => {
  it('HT_NO_TEXT and HT_NO_TITLE', () => {
    const c = codes(issues({ ...exercise(), text: '  ', title: '' }));
    expect(c).toContain('HT_NO_TEXT');
    expect(c).toContain('HT_NO_TITLE');
  });

  it('HT_TEXT_SHORT under 25 words, not on an empty text', () => {
    const short = issues({ ...exercise(), text: words(24) });
    expect(short.find((i) => i.code === 'HT_TEXT_SHORT')).toMatchObject({ words: 24 });
    expect(codes(issues({ ...exercise(), text: words(25) }))).not.toContain('HT_TEXT_SHORT');
    expect(codes(issues({ ...exercise(), text: '' }))).not.toContain('HT_TEXT_SHORT');
  });

  it('HT_TEXT_LONG over 260 words', () => {
    expect(codes(issues({ ...exercise(), text: words(261) }))).toContain('HT_TEXT_LONG');
    expect(codes(issues({ ...exercise(), text: words(260) }))).not.toContain('HT_TEXT_LONG');
  });
});

describe('step 2 — questions and marks', () => {
  it('HT_ORPHANED_MARKS blocks while any orphan waits (AC-R3)', () => {
    const ex = { ...exercise(), orphans: [{ id: 'o', qid: 'q1', surface: 'x', why: '' }] };
    expect(issues(ex).find((i) => i.code === 'HT_ORPHANED_MARKS')).toMatchObject({ level: 'blocker', count: 1 });
    expect(isReady(ex)).toBe(false);
  });

  it('HT_NO_QUESTIONS', () => {
    expect(codes(issues({ ...exercise(), questions: [] }))).toContain('HT_NO_QUESTIONS');
  });

  it('AC-A2: HT_QUESTION_NO_PROMPT names the question and blocks', () => {
    const found = issues(withQ(exercise(), 'q2', { prompt: ' ' }));
    expect(found.find((i) => i.code === 'HT_QUESTION_NO_PROMPT')).toMatchObject({ level: 'blocker', questionId: 'q2' });
  });

  it('HT_QUESTION_NO_SPANS only once the prompt is written', () => {
    expect(codes(issues(withQ(exercise(), 'q2', { spans: [] })))).toContain('HT_QUESTION_NO_SPANS');
    expect(codes(issues(withQ(exercise(), 'q2', { spans: [], prompt: '' })))).not.toContain('HT_QUESTION_NO_SPANS');
  });

  it('AC-M4: two marks over the same token in one question block', () => {
    const ex = exercise();
    const q2 = ex.questions[1]!;
    const extra = spanAt(ex.text, 'uka', 1, 'dup');
    const found = issues(withQ(ex, 'q2', { spans: [...q2.spans, extra] }));
    expect(found.find((i) => i.code === 'HT_SPANS_OVERLAP')).toMatchObject({ level: 'blocker', questionId: 'q2' });
  });

  it('AC-M5: the same words in two different questions raise nothing', () => {
    const ex = exercise();
    const both = withQ(ex, 'q2', { spans: [...ex.questions[1]!.spans, spanAt(ex.text, 'reiste', 1, 'shared')] });
    expect(issues(both)).toEqual([]);
  });

  it('HT_SPAN_OFF_TOKENS on a span that does not sit on word edges (Q3-A)', () => {
    const ex = exercise();
    const tok = ex.questions[0]!.spans.find((s) => s.id === 'tok')!;
    const off = withQ(ex, 'q1', { spans: ex.questions[0]!.spans.map((s) => (s === tok ? { ...s, end: s.end + 1 } : s)) });
    expect(issues(off).find((i) => i.code === 'HT_SPAN_OFF_TOKENS')).toMatchObject({ questionId: 'q1', spanId: 'tok' });
    const nowhere = withQ(ex, 'q1', { spans: [...ex.questions[0]!.spans, { id: 'x', start: 9000, end: 9004, why: '' }] });
    expect(codes(issues(nowhere))).toContain('HT_SPAN_OFF_TOKENS');
  });

  it('HT_TOO_FEW_SPANS with one or two marks', () => {
    const ex = exercise();
    const two = withQ(ex, 'q1', { spans: ex.questions[0]!.spans.slice(0, 2) });
    expect(issues(two).find((i) => i.code === 'HT_TOO_FEW_SPANS')).toMatchObject({ questionId: 'q1', count: 2 });
    expect(codes(issues(withQ(ex, 'q1', { spans: ex.questions[0]!.spans.slice(0, 3) })))).not.toContain('HT_TOO_FEW_SPANS');
  });

  it('AC-A4: marks over 45% of the passage warn', () => {
    const text = words(20) + ' ' + words(20).replace(/ord/g, 'and');
    const tokens = tokenize(text);
    const nine = tokens.slice(0, 18).map((t, i) => ({ id: `s${i}`, start: t.s, end: t.e, why: '' }));
    const ex: HighlightInTextContent = { ...exercise({ text }), questions: [question('q', { spans: nine })] };
    const found = issues(ex).find((i) => i.code === 'HT_DENSITY_HIGH');
    expect(found).toMatchObject({ level: 'warning', questionId: 'q', share: 0.45 });
    const fewer = { ...ex, questions: [question('q', { spans: nine.slice(0, 16) })] };
    expect(codes(issues(fewer))).not.toContain('HT_DENSITY_HIGH');
  });

  it('HT_UNIT_MISMATCH — a phrase mark in a single-words question', () => {
    expect(codes(issues(withQ(exercise(), 'q2', { unit: 'word' })))).toContain('HT_UNIT_MISMATCH');
    expect(codes(issues(withQ(exercise(), 'q1', { unit: 'phrase' })))).not.toContain('HT_UNIT_MISMATCH');
  });

  it('HT_DUPLICATE_PROMPT names the second question', () => {
    const ex = withQ(exercise(), 'q2', { prompt: '  marker alle verbene   som står i preteritum. ' });
    expect(issues(ex).find((i) => i.code === 'HT_DUPLICATE_PROMPT')).toMatchObject({ questionId: 'q2' });
  });

  it('HT_TOO_MANY_QUESTIONS past four', () => {
    const ex = exercise();
    const many = { ...ex, questions: [...ex.questions, ...['a', 'b', 'c'].map((id) => ({ ...ex.questions[0]!, id, prompt: id }))] };
    expect(codes(issues(many))).toContain('HT_TOO_MANY_QUESTIONS');
  });
});

describe('step 3 — feedback', () => {
  it('AC-A5: no miss hint on a question with spans blocks', () => {
    const ex = withQ(exercise(), 'q1', { missHint: '' });
    expect(issues(ex).find((i) => i.code === 'HT_NO_MISS_HINT')).toMatchObject({ level: 'blocker', questionId: 'q1' });
    expect(isReady(ex)).toBe(false);
  });

  it('HT_NO_FP_HINT warns', () => {
    const found = issues(withQ(exercise(), 'q2', { fpHint: '' }));
    expect(found.find((i) => i.code === 'HT_NO_FP_HINT')).toMatchObject({ level: 'warning', questionId: 'q2' });
  });

  it('neither fires on a question with no spans (Q6-A)', () => {
    const c = codes(issues(withQ(exercise(), 'q2', { spans: [], missHint: '', fpHint: '' })));
    expect(c).not.toContain('HT_NO_MISS_HINT');
    expect(c).not.toContain('HT_NO_FP_HINT');
  });
});

describe('step 4 — difficulty', () => {
  it('HT_PENALTY_OFF, HT_COUNT_SHOWN, HT_ONE_SHOT_REVEAL — warnings only', () => {
    const ex = { ...exercise(), settings: { ...exercise().settings, penalty: 'off' as const, showCount: true, attempts: 1 as const } };
    const found = issues(ex);
    expect(codes(found)).toEqual(['HT_PENALTY_OFF', 'HT_COUNT_SHOWN', 'HT_ONE_SHOT_REVEAL']);
    expect(found.every((i) => i.level === 'warning')).toBe(true);
    expect(isReady(ex)).toBe(true);
  });

  it('one attempt without a reveal is not a one-shot reveal', () => {
    const ex = { ...exercise(), settings: { ...exercise().settings, attempts: 1 as const, revealKey: false } };
    expect(issues(ex)).toEqual([]);
  });
});

describe('stepState', () => {
  it('AC-A1: a blank draft shows blocker counts on steps 1 and 2; step 3 is empty (Q6-A)', () => {
    const ex = emptyContent();
    expect(stepState(ex, 1)).toEqual({ s: 'err', errs: 2 });
    expect(stepState(ex, 2)).toEqual({ s: 'err', errs: 1 });
    expect(stepState(ex, 3)).toEqual({ s: 'empty', errs: 0 });
    expect(stepState(ex, 4)).toEqual({ s: 'ok', errs: 0 });
  });

  it('turns step 3 red once a question has a mark and no miss hint', () => {
    const base = { ...emptyContent(), title: 'T', text: words(30) };
    const q = base.questions[0]!;
    const ex = toggleMark({ ...base, questions: [{ ...q, prompt: 'P' }] }, q.id, 0, 0).ex;
    expect(stepState(ex, 3)).toEqual({ s: 'err', errs: 1 });
  });

  it('warn and ok', () => {
    expect(stepState(withQ(exercise(), 'q1', { fpHint: '' }), 3)).toEqual({ s: 'warn', errs: 0 });
    expect(stepState(exercise(), 2)).toEqual({ s: 'ok', errs: 0 });
  });
});
