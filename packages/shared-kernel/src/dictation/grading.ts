// Grading for `dictation`: one sentence at a time, and what a check leaves behind.
//
// ── The attempt, segment by segment ─────────────────────────────────────────
// The mechanics of `highlight_in_text` (plan 67, Q1-A and Q8-A) with a sentence where that
// type has a question — SPEC_api_contract §3, DECISIONS §8:
//
//   * one attempt holds every ready segment; each submit is about one of them. The server
//     carries every segment's state from submit to submit (`segments`) and this function
//     decides from it — a client cannot send its own;
//   * the budget is **per segment** (`settings.attempts`, 0 = unlimited); a reveal is not a
//     check and spends nothing;
//   * a segment closes when it passes, is revealed, or runs out of checks. A passed or
//     revealed one refuses everything further (AC-R9); one out of checks still allows
//     «Vis fasit»;
//   * what is recorded is the **first** check of each segment (AC-R8). The attempt's score is
//     the mean of those over the ready segments — a long sentence does not outweigh a short
//     one (DECISIONS §4) — and the attempt is complete when every ready segment is closed;
//     `completedNow` marks the submit on which that happened, which is when the engine sends
//     the evidence;
//   * checks of one segment are at least `DC_CHECK_INTERVAL_MS` apart (decision Q4-A): the
//     diff must not become a spelling oracle. The server passes `now`; without it there is
//     no throttle (the builder's preview).
//
// ── What a check returns ────────────────────────────────────────────────────
// The word diff's `ops` — the whole verdict UI and what a report will read (SPEC §6) — and
// its counters; each wrong or missing focus word by name with its reason (AC-M7, AC-R7);
// `segment.why` only after a failed check under `settings.hints`. The sentence itself only on
// reveal. Under the `after` policy the transcript arrives **one closed segment at a time**
// (`transcriptSlice`) — the prototype's drawer showed the whole transcript after the first
// check, which is the key of the sentences still to be written (plan 68 §3.6).
//
// ── What a check stores (decision Q5-A) ─────────────────────────────────────
// Each segment's state keeps its first check: the counters, the classes that occurred, the
// focus words that came back wrong and the ops themselves. A class-wide report is then a
// query over attempts, not a re-grade.
//
// ── What a reload needs ─────────────────────────────────────────────────────
// The state also keeps what the student has already been shown about the segment, so a
// resumed attempt can draw it again without a document to grade against: the last check's
// corrected line (the summary shows it, AC-R10, beside the first check's score — the
// record), the sentence once revealed, and the transcript slice once the segment closed.
// None of it is new to the student: each was in the answer to a submit they made.

import type { DiffOp, DiffResult, WordCounts } from './diff.js';
import { diff, passes } from './diff.js';
import type { ErrorClass } from './classify.js';
import { readySegments } from './derive.js';
import type { DictationContent, Segment, Settings } from './model.js';
import { DC_CHECK_INTERVAL_MS, maxChecks } from './model.js';
import { packOf } from './presets.js';
import { tokens } from './tokens.js';

// ── one check ───────────────────────────────────────────────────────────────

/** Grade one typed sentence against one segment of the key. Pure; the preview calls it too. */
export function gradeSegment(ex: DictationContent, seg: Segment, typed: string): DiffResult {
  return diff(
    seg.text,
    typed,
    ex.marking,
    seg.focus.map((f) => f.wordIndex),
    packOf(ex.language),
  );
}

/** A wrong or missing focus word, by name — one line of the verdict each. */
export interface FocusMiss {
  focusId: string;
  /** The word as the key spells it. */
  word: string;
  /** Its reason; `''` when the author left none. */
  why: string;
}

/** The focus words a check got wrong, in sentence order. */
export function focusMisses(seg: Segment, ops: readonly DiffOp[]): FocusMiss[] {
  const words = tokens(seg.text);
  const missed = new Set<number>();
  for (const op of ops) {
    if (op.k === 'del' && op.focus) missed.add(op.i);
    if (op.k === 'sub' && op.focus) for (let k = op.i; k < op.i + op.n; k++) missed.add(k);
  }
  return seg.focus
    .filter((f) => missed.has(f.wordIndex))
    .sort((a, b) => a.wordIndex - b.wordIndex)
    .map((f) => ({ focusId: f.id, word: words[f.wordIndex]?.w ?? '', why: f.why.trim() }));
}

/** An op as it goes on the wire: a focus substitution or omission carries its reason. */
export type VerdictOp = DiffOp & { why?: string };

function withReasons(seg: Segment, ops: readonly DiffOp[], withWhy: boolean): VerdictOp[] {
  if (!withWhy) return [...ops];
  const why = new Map(seg.focus.map((f) => [f.wordIndex, f.why.trim()]));
  return ops.map((op) => {
    if ((op.k === 'sub' || op.k === 'del') && op.focus) {
      const reason = why.get(op.i) ?? '';
      return reason === '' ? op : { ...op, why: reason };
    }
    return op;
  });
}

// ── the attempt ─────────────────────────────────────────────────────────────

/** A segment's first check, kept for the evidence and for later reports (Q5-A). */
export interface FirstCheck {
  words: WordCounts;
  /** Classes that occurred, each once, in order of first occurrence. */
  classes: ErrorClass[];
  /** Ids of the focus words that came back wrong. */
  wrongFocus: string[];
  ops: DiffOp[];
}

/** The last check of a segment, as the student saw it — the summary's corrected line. */
export interface LastCheck {
  /** 0-100 rounded. */
  pct: number;
  words: WordCounts;
  ops: VerdictOp[];
}

/** The sentence as a reveal showed it. */
export interface RevealedKey {
  text: string;
  why: string;
  focus: KeyFocus[];
}

/** What the server carries forward for one segment between submits. */
export interface SegmentState {
  segmentId: string;
  /** Checks made. A reveal is not one. */
  checks: number;
  /** 0..1 — the first check's score; `null` until there was one. */
  firstScore: number | null;
  /** Whether the first check passed — decided in whole numbers, carried, never recomputed. */
  firstPassed: boolean | null;
  passed: boolean;
  revealed: boolean;
  /** No further check: passed, revealed, or out of checks. */
  closed: boolean;
  /** The last checked text — a retry keeps it, a reload restores it (DECISIONS §8). */
  lastText: string;
  /** Epoch ms of the last check, for the throttle. */
  lastCheckAt: number | null;
  first: FirstCheck | null;
  /** The last check as shown; `null` until there was one. */
  last: LastCheck | null;
  /** The sentence, once revealed. */
  key: RevealedKey | null;
  /** The transcript slice, once the segment closed under the `after` policy. */
  transcriptSlice: string | null;
}

export interface CheckInput {
  ex: DictationContent;
  segmentId: string;
  /** What the student wrote. Ignored on a reveal. */
  text?: string;
  /** «Vis fasit» — closes the segment and returns its sentence. */
  reveal?: boolean;
  /** Carried forward by the server; absent on the attempt's first submit. */
  segments?: readonly SegmentState[];
  /** A graded attempt — one check per segment, no hints, no reveal (plan 67, Q8-A). */
  graded?: boolean;
  /** Epoch ms, from the server. Without it there is no throttle. */
  now?: number;
}

/** A focus word on a revealed sentence. */
export interface KeyFocus {
  focusId: string;
  word: string;
  why: string;
}

export interface CheckResult {
  segmentId: string;
  /** This check, 0-100 rounded. On a reveal: the segment's first check. */
  pct: number;
  /** This segment, this check. Never on a reveal. */
  passed: boolean;
  words: WordCounts;
  /** The corrected line. Empty on a reveal. */
  ops: VerdictOp[];
  /** The wrong focus words, by name. Empty on a reveal and in a graded attempt. */
  focus: FocusMiss[];
  /** `segment.why` — after a failed check, under `settings.hints`. */
  why?: string;
  /** Only on a reveal: the sentence, its reason and every focus word with its own. */
  key?: RevealedKey;
  /** The sentence for the transcript drawer, when the policy allows and the segment closed. */
  transcriptSlice?: string;
  /** Which check of this segment this was (a reveal reports the last). */
  attempt: number;
  /** Checks of this segment still allowed, or `null` for unlimited. */
  checksLeft: number | null;
  closed: boolean;
  revealed: boolean;
  /** Every ready segment's state after this submit — to be carried into the next. */
  segments: SegmentState[];
  complete: boolean;
  completedNow: boolean;
  /** Mean of first checks over the ready segments, 0-100 rounded. */
  attemptPct: number;
  /** `attemptPct ≥ threshold`, on the unrounded mean. */
  attemptPassed: boolean;
}

export type CheckRefusal =
  /** Not a ready segment of this exercise. */
  | 'DICT_SEGMENT_UNKNOWN'
  /** Passed or revealed — nothing more (AC-R9). Or out of checks, for a check. */
  | 'DICT_SEGMENT_CLOSED'
  /** `revealKey` off, or no check yet. */
  | 'DICT_REVEAL_NOT_ALLOWED'
  /** A check sooner than `DC_CHECK_INTERVAL_MS` after the last one (AC-X6). */
  | 'DICT_TOO_FAST';

export type CheckOutcome = { ok: true; result: CheckResult } | { ok: false; code: CheckRefusal };

function effectiveSettings(ex: DictationContent, graded: boolean): Settings {
  return graded ? { ...ex.settings, attempts: 1, hints: false, revealKey: false } : ex.settings;
}

export function check(input: CheckInput): CheckOutcome {
  const { ex, segmentId } = input;
  const graded = input.graded === true;
  const s = effectiveSettings(ex, graded);
  const ready = readySegments(ex);
  const seg = ready.find((x) => x.id === segmentId);
  if (!seg) return { ok: false, code: 'DICT_SEGMENT_UNKNOWN' };

  const carried = new Map((input.segments ?? []).map((st) => [st.segmentId, st]));
  const before: SegmentState[] = ready.map((x) => carried.get(x.id) ?? fresh(x.id));
  const wasComplete = before.every((st) => st.closed);
  const prev = before.find((st) => st.segmentId === segmentId) as SegmentState;
  const max = maxChecks(s);
  const sliceOnClose = ex.audio.settings.transcriptWhen === 'after';

  let next: SegmentState;
  let result: Omit<
    CheckResult,
    'segments' | 'complete' | 'completedNow' | 'attemptPct' | 'attemptPassed'
  >;

  if (input.reveal === true) {
    if (prev.passed || prev.revealed) return { ok: false, code: 'DICT_SEGMENT_CLOSED' };
    if (!s.revealKey || prev.checks === 0) return { ok: false, code: 'DICT_REVEAL_NOT_ALLOWED' };

    const words = tokens(seg.text);
    const key: RevealedKey = {
      text: seg.text.trim(),
      why: seg.why.trim(),
      focus: seg.focus.map((f) => ({
        focusId: f.id,
        word: words[f.wordIndex]?.w ?? '',
        why: f.why.trim(),
      })),
    };
    const slice = sliceOnClose ? seg.text.trim() : null;
    next = { ...prev, revealed: true, closed: true, key, transcriptSlice: slice };
    result = {
      segmentId,
      pct: pctOf(prev.firstScore ?? 0),
      passed: false,
      words: prev.first?.words ?? emptyCounts(words.length),
      ops: [],
      focus: [],
      key,
      ...(slice === null ? {} : { transcriptSlice: slice }),
      attempt: prev.checks,
      checksLeft: max === null ? null : Math.max(0, max - prev.checks),
      closed: true,
      revealed: true,
    };
  } else {
    if (prev.closed) return { ok: false, code: 'DICT_SEGMENT_CLOSED' };
    if (
      input.now !== undefined &&
      prev.lastCheckAt !== null &&
      input.now - prev.lastCheckAt < DC_CHECK_INTERVAL_MS
    ) {
      return { ok: false, code: 'DICT_TOO_FAST' };
    }

    const text = input.text ?? '';
    const d = gradeSegment(ex, seg, text);
    const passed = passes(d, s.threshold);
    const checks = prev.checks + 1;
    const checksLeft = max === null ? null : Math.max(0, max - checks);
    const closed = passed || checksLeft === 0;
    const misses = focusMisses(seg, d.ops);
    const ops = withReasons(seg, d.ops, !graded);
    const slice = closed && sliceOnClose ? seg.text.trim() : null;

    next = {
      segmentId,
      checks,
      firstScore: prev.firstScore ?? d.score,
      firstPassed: prev.firstPassed ?? passed,
      passed: prev.passed || passed,
      revealed: false,
      closed,
      lastText: text,
      lastCheckAt: input.now ?? null,
      first: prev.first ?? {
        words: d.words,
        classes: classesOf(d.ops),
        wrongFocus: misses.map((m) => m.focusId),
        ops: d.ops,
      },
      last: { pct: pctOf(d.score), words: d.words, ops },
      key: null,
      transcriptSlice: slice,
    };
    result = {
      segmentId,
      pct: pctOf(d.score),
      passed,
      words: d.words,
      ops,
      focus: graded ? [] : misses,
      ...(!passed && s.hints && seg.why.trim() !== '' ? { why: seg.why.trim() } : {}),
      ...(slice === null ? {} : { transcriptSlice: slice }),
      attempt: checks,
      checksLeft,
      closed,
      revealed: false,
    };
  }

  const segments = before.map((st) => (st.segmentId === segmentId ? next : st));
  const complete = segments.every((st) => st.closed);
  const mean = segments.reduce((n, st) => n + (st.firstScore ?? 0), 0) / segments.length;

  return {
    ok: true,
    result: {
      ...result,
      segments,
      complete,
      completedNow: complete && !wasComplete,
      attemptPct: pctOf(mean),
      attemptPassed: mean * 100 >= s.threshold,
    },
  };
}

function classesOf(ops: readonly DiffOp[]): ErrorClass[] {
  const out: ErrorClass[] = [];
  for (const op of ops) if (op.k === 'sub' && !out.includes(op.cls)) out.push(op.cls);
  return out;
}

function emptyCounts(total: number): WordCounts {
  return { total, exact: 0, near: 0, wrong: 0, missing: total, extra: 0 };
}

/**
 * The carried segment states, read back from wherever the server stored them — `unknown`, so
 * it must not throw. A malformed entry is dropped and its segment starts fresh.
 */
export function readSegmentStates(value: unknown): SegmentState[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): SegmentState[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const st = raw as Record<string, unknown>;
    if (typeof st['segmentId'] !== 'string') return [];
    return [
      {
        segmentId: st['segmentId'],
        checks:
          typeof st['checks'] === 'number' && st['checks'] >= 0 ? Math.trunc(st['checks']) : 0,
        firstScore: typeof st['firstScore'] === 'number' ? st['firstScore'] : null,
        firstPassed: typeof st['firstPassed'] === 'boolean' ? st['firstPassed'] : null,
        passed: st['passed'] === true,
        revealed: st['revealed'] === true,
        closed: st['closed'] === true,
        lastText: typeof st['lastText'] === 'string' ? st['lastText'] : '',
        lastCheckAt: typeof st['lastCheckAt'] === 'number' ? st['lastCheckAt'] : null,
        first: readFirst(st['first']),
        last: readLast(st['last']),
        key: readKey(st['key']),
        transcriptSlice: typeof st['transcriptSlice'] === 'string' ? st['transcriptSlice'] : null,
      },
    ];
  });
}

function readFirst(value: unknown): FirstCheck | null {
  if (typeof value !== 'object' || value === null) return null;
  const f = value as Record<string, unknown>;
  return {
    words: readCounts(f['words']),
    classes: Array.isArray(f['classes'])
      ? (f['classes'].filter((c) => typeof c === 'string') as ErrorClass[])
      : [],
    wrongFocus: Array.isArray(f['wrongFocus'])
      ? f['wrongFocus'].filter((c): c is string => typeof c === 'string')
      : [],
    ops: Array.isArray(f['ops']) ? (f['ops'] as DiffOp[]) : [],
  };
}

function readCounts(value: unknown): WordCounts {
  const w = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const n = (k: string): number => (typeof w[k] === 'number' ? (w[k] as number) : 0);
  return {
    total: n('total'),
    exact: n('exact'),
    near: n('near'),
    wrong: n('wrong'),
    missing: n('missing'),
    extra: n('extra'),
  };
}

function readLast(value: unknown): LastCheck | null {
  if (typeof value !== 'object' || value === null) return null;
  const l = value as Record<string, unknown>;
  return {
    pct: typeof l['pct'] === 'number' ? l['pct'] : 0,
    words: readCounts(l['words']),
    ops: Array.isArray(l['ops']) ? (l['ops'] as VerdictOp[]) : [],
  };
}

function readKey(value: unknown): RevealedKey | null {
  if (typeof value !== 'object' || value === null) return null;
  const k = value as Record<string, unknown>;
  if (typeof k['text'] !== 'string') return null;
  const focus = Array.isArray(k['focus'])
    ? k['focus'].flatMap((raw): KeyFocus[] => {
        if (typeof raw !== 'object' || raw === null) return [];
        const f = raw as Record<string, unknown>;
        return typeof f['focusId'] === 'string' && typeof f['word'] === 'string'
          ? [{ focusId: f['focusId'], word: f['word'], why: typeof f['why'] === 'string' ? f['why'] : '' }]
          : [];
      })
    : [];
  return { text: k['text'], why: typeof k['why'] === 'string' ? k['why'] : '', focus };
}

function fresh(segmentId: string): SegmentState {
  return {
    segmentId,
    checks: 0,
    firstScore: null,
    firstPassed: null,
    passed: false,
    revealed: false,
    closed: false,
    lastText: '',
    lastCheckAt: null,
    first: null,
    last: null,
    key: null,
    transcriptSlice: null,
  };
}

function pctOf(score: number): number {
  return Math.round(score * 100);
}
