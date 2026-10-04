// SPEC_api_contract §3, DECISIONS §8, AC-R7 – AC-R9, AC-X6, decision Q4-A.

import { describe, expect, it } from 'vitest';

import { sample } from './fixtures.test-support.js';
import type { CheckInput, CheckResult, SegmentState } from './grading.js';
import { check, readSegmentStates } from './grading.js';
import { DC_CHECK_INTERVAL_MS } from './model.js';

const ok = (input: CheckInput): CheckResult => {
  const out = check(input);
  if (!out.ok) throw new Error(out.code);
  return out.result;
};

const A = 'På kjøkkenet står det en skje.';
const B = 'Vi hadde ikke hørt noe i går.';

describe('check — one segment', () => {
  it('a perfect sentence passes and closes; the slice of the transcript comes with it', () => {
    const r = ok({ ex: sample(), segmentId: 'a', text: A });
    expect(r).toMatchObject({
      pct: 100,
      passed: true,
      closed: true,
      transcriptSlice: A,
      attempt: 1,
    });
    expect(r.why).toBeUndefined();
  });

  it('AC-R7: a failed check names the focus word with its reason and gives the sentence’s why', () => {
    const r = ok({ ex: sample(), segmentId: 'a', text: 'På sjøkkenet står det en sje.' });
    expect(r.passed).toBe(false);
    expect(r.focus).toEqual([{ focusId: 'f1', word: 'kjøkkenet', why: 'kj- foran ø.' }]);
    expect(r.why).toBe('A rule the ear missed.');
    expect(r.ops.find((o) => o.k === 'sub' && o.focus)).toMatchObject({ why: 'kj- foran ø.' });
    expect(r.transcriptSlice).toBeUndefined();
    expect(r.key).toBeUndefined();
  });

  it('no why without hints', () => {
    const ex = sample();
    const r = ok({
      ex: { ...ex, settings: { ...ex.settings, hints: false } },
      segmentId: 'a',
      text: 'feil',
    });
    expect(r.why).toBeUndefined();
  });

  it('no slice when the policy is never', () => {
    const ex = sample();
    const never = {
      ...ex,
      audio: { ...ex.audio, settings: { ...ex.audio.settings, transcriptWhen: 'never' as const } },
    };
    expect(ok({ ex: never, segmentId: 'a', text: A }).transcriptSlice).toBeUndefined();
  });
});

describe('check — the attempt', () => {
  it('AC-R8: a retry keeps the first check as the record', () => {
    const first = ok({ ex: sample(), segmentId: 'a', text: 'helt feil' });
    const second = ok({ ex: sample(), segmentId: 'a', text: A, segments: first.segments });
    expect(second.passed).toBe(true);
    const st = second.segments.find((s) => s.segmentId === 'a') as SegmentState;
    expect(st.firstPassed).toBe(false);
    expect(st.firstScore).toBe(0);
    expect(st.checks).toBe(2);
    expect(st.lastText).toBe(A);
  });

  it('the budget is per segment; out of checks closes but still allows a reveal', () => {
    let segs = ok({ ex: sample(), segmentId: 'a', text: 'feil' }).segments;
    const r = ok({ ex: sample(), segmentId: 'a', text: 'feil igjen', segments: segs });
    expect(r).toMatchObject({ closed: true, checksLeft: 0, transcriptSlice: A });
    segs = r.segments;
    expect(check({ ex: sample(), segmentId: 'a', text: A, segments: segs })).toEqual({
      ok: false,
      code: 'DICT_SEGMENT_CLOSED',
    });
    expect(ok({ ex: sample(), segmentId: 'a', reveal: true, segments: segs }).revealed).toBe(true);
  });

  it('AC-R9: a reveal shows the sentence, closes the segment and refuses any further check', () => {
    const segs = ok({ ex: sample(), segmentId: 'a', text: 'feil' }).segments;
    const r = ok({ ex: sample(), segmentId: 'a', reveal: true, segments: segs });
    expect(r.key).toEqual({
      text: A,
      why: 'A rule the ear missed.',
      focus: [{ focusId: 'f1', word: 'kjøkkenet', why: 'kj- foran ø.' }],
    });
    expect(r).toMatchObject({ closed: true, revealed: true, passed: false, pct: 0, ops: [] });
    expect(check({ ex: sample(), segmentId: 'a', text: A, segments: r.segments })).toEqual({
      ok: false,
      code: 'DICT_SEGMENT_CLOSED',
    });
    expect(check({ ex: sample(), segmentId: 'a', reveal: true, segments: r.segments })).toEqual({
      ok: false,
      code: 'DICT_SEGMENT_CLOSED',
    });
  });

  it('no reveal before a check, nor with revealKey off', () => {
    expect(check({ ex: sample(), segmentId: 'a', reveal: true })).toEqual({
      ok: false,
      code: 'DICT_REVEAL_NOT_ALLOWED',
    });
    const ex = sample();
    const off = { ...ex, settings: { ...ex.settings, revealKey: false } };
    const segs = ok({ ex: off, segmentId: 'a', text: 'feil' }).segments;
    expect(check({ ex: off, segmentId: 'a', reveal: true, segments: segs })).toEqual({
      ok: false,
      code: 'DICT_REVEAL_NOT_ALLOWED',
    });
  });

  it('an unknown segment is refused', () => {
    expect(check({ ex: sample(), segmentId: 'zz', text: 'x' })).toEqual({
      ok: false,
      code: 'DICT_SEGMENT_UNKNOWN',
    });
  });

  it('completes on the submit that closes the last segment; the score is the mean of first checks', () => {
    const one = ok({ ex: sample(), segmentId: 'a', text: 'helt feil', now: 0 });
    expect(one.complete).toBe(false);
    const two = ok({ ex: sample(), segmentId: 'b', text: B, segments: one.segments, now: 10_000 });
    expect(two.complete).toBe(false);
    const three = ok({
      ex: sample(),
      segmentId: 'a',
      text: A,
      segments: two.segments,
      now: 20_000,
    });
    expect(three).toMatchObject({
      complete: true,
      completedNow: true,
      attemptPct: 50,
      attemptPassed: false,
    });
  });

  it('keeps the first check for reports: counters, classes, wrong focus words, ops (Q5-A)', () => {
    const r = ok({ ex: sample(), segmentId: 'a', text: 'paa sjøkkenet står det en skje.' });
    const first = r.segments.find((s) => s.segmentId === 'a')?.first;
    expect(first?.classes).toEqual(['diacritic', 'typo']);
    expect(first?.wrongFocus).toEqual(['f1']);
    expect(first?.ops.length).toBe(6);
  });
});

describe('throttle (AC-X6, Q4-A)', () => {
  it('refuses a check of the same segment sooner than the interval', () => {
    const segs = ok({ ex: sample(), segmentId: 'a', text: 'feil', now: 1000 }).segments;
    expect(
      check({
        ex: sample(),
        segmentId: 'a',
        text: 'feil 2',
        segments: segs,
        now: 1000 + DC_CHECK_INTERVAL_MS - 1,
      }),
    ).toEqual({
      ok: false,
      code: 'DICT_TOO_FAST',
    });
    expect(
      check({
        ex: sample(),
        segmentId: 'a',
        text: 'feil 2',
        segments: segs,
        now: 1000 + DC_CHECK_INTERVAL_MS,
      }).ok,
    ).toBe(true);
  });

  it('another segment and a reveal are not throttled', () => {
    const segs = ok({ ex: sample(), segmentId: 'a', text: 'feil', now: 1000 }).segments;
    expect(check({ ex: sample(), segmentId: 'b', text: B, segments: segs, now: 1001 }).ok).toBe(
      true,
    );
    expect(
      check({ ex: sample(), segmentId: 'a', reveal: true, segments: segs, now: 1001 }).ok,
    ).toBe(true);
  });
});

describe('graded (plan 67, Q8-A)', () => {
  it('one check, no hints, no reasons, no reveal', () => {
    const r = ok({
      ex: sample(),
      segmentId: 'a',
      text: 'På sjøkkenet står det en sje.',
      graded: true,
    });
    expect(r).toMatchObject({ closed: true, checksLeft: 0, focus: [] });
    expect(r.why).toBeUndefined();
    expect(r.ops.some((o) => 'why' in o)).toBe(false);
    expect(
      check({ ex: sample(), segmentId: 'a', reveal: true, segments: r.segments, graded: true }),
    ).toEqual({
      ok: false,
      code: 'DICT_REVEAL_NOT_ALLOWED',
    });
  });
});

describe('check — what a reload needs is in the state', () => {
  it('the last check as shown, beside the first as recorded (AC-R8, AC-R10)', () => {
    const first = ok({ ex: sample(), segmentId: 'a', text: 'helt feil' });
    const second = ok({ ex: sample(), segmentId: 'a', text: 'På sjøkkenet står det en skje.', segments: first.segments });
    const st = second.segments.find((x) => x.segmentId === 'a');
    expect(st?.firstScore).toBe(0);
    expect(st?.last).toEqual({ pct: second.pct, words: second.words, ops: second.ops });
    // The focus reason travels with the stored line, as it did in the answer.
    expect(st?.last?.ops.find((o) => o.k === 'sub' && o.focus)).toMatchObject({ why: 'kj- foran ø.' });
    expect(st?.key).toBeNull();
    // Two checks of two: closed by the budget, so its slice is owed.
    expect(st?.closed).toBe(true);
    expect(st?.transcriptSlice).toBe(A);
    // After one check it was still open, and carried nothing.
    expect(first.segments.find((x) => x.segmentId === 'a')?.transcriptSlice).toBeNull();
  });

  it('the slice once closed, and nothing of a segment still open', () => {
    const r = ok({ ex: sample(), segmentId: 'a', text: A });
    expect(r.segments.find((x) => x.segmentId === 'a')?.transcriptSlice).toBe(A);
    expect(r.segments.find((x) => x.segmentId === 'b')).toMatchObject({ last: null, key: null, transcriptSlice: null });
    expect(JSON.stringify(r.segments)).not.toContain('hadde');
  });

  it('the sentence once revealed', () => {
    const first = ok({ ex: sample(), segmentId: 'a', text: 'helt feil' });
    const r = ok({ ex: sample(), segmentId: 'a', reveal: true, segments: first.segments });
    const st = r.segments.find((x) => x.segmentId === 'a');
    expect(st?.key).toEqual(r.key);
    expect(st?.transcriptSlice).toBe(A);
    // A reveal is not a check: the last line stays the one the student wrote.
    expect(st?.last).toEqual(first.segments.find((x) => x.segmentId === 'a')?.last);
  });

  it('a graded check stores no reasons, as it showed none', () => {
    const r = ok({ ex: sample(), segmentId: 'a', text: 'På sjøkkenet står det en sje.', graded: true });
    const st = r.segments.find((x) => x.segmentId === 'a');
    expect(JSON.stringify(st?.last)).not.toContain('kj- foran');
  });
});

describe('readSegmentStates', () => {
  it('round-trips and never throws on junk', () => {
    const r = ok({ ex: sample(), segmentId: 'a', text: 'feil', now: 5 });
    expect(readSegmentStates(JSON.parse(JSON.stringify(r.segments)))).toEqual(r.segments);
    const shown = ok({ ex: sample(), segmentId: 'a', reveal: true, segments: r.segments });
    expect(readSegmentStates(JSON.parse(JSON.stringify(shown.segments)))).toEqual(shown.segments);
    expect(readSegmentStates('x')).toEqual([]);
    expect(readSegmentStates([null, { segmentId: 3 }, { segmentId: 'a' }])).toHaveLength(1);
  });
});
