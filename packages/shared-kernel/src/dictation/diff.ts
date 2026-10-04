// The word diff — SPEC_data_model §4, DECISIONS §3–5.
//
// One pure function, called by the builder (preview, «Try a student answer»), the engine's
// grader and nothing else. The student's client never runs it: it has no key (plan 68 §3.5).
//
//   1. Tokenize both sides (tokens.ts) and build comparison keys (classify.ts).
//   2. LCS alignment on the keys → a run of `eq` / `del` / `ins`.
//   3. **Seam pairing.** Between two `eq`, deletions and insertions are paired in order into
//      substitutions. This is what turns «missing *kjøkkenet*, extra *sjøkkenet*» into «wrote
//      *sjøkkenet*, expected *kjøkkenet*».
//   4. **Word boundaries.** Inside a seam, two or three expected words written as one
//      (`igår` for `i går`), or one written as two or three, become a single `boundary`
//      substitution over the whole expression — never a stray word (AC-M6). The handoff's
//      class table has no row for it; the prototype and AC-M6 do (plan 68 §4.2, 1).
//   5. Classify each substitution (classify.ts).
//   6. **Focus.** A substitution or omission on a focus word is never near-eligible, whatever
//      the class (DECISIONS §5). A boundary is on a focus word when any word it covers is.
//   7. Score: `max(0, (exact + nearCredit − extra·extraCost) / expected)`, nearCredit 0.5 per
//      near miss under `half` (DECISIONS §4).
//
// Under `strict` nothing is near: the handoff's table has it scored and reported «feil», so a
// near miss there is counted and drawn as wrong. The prototype kept counting «nesten» under
// `strict` and only changed the sentence.
//
// The function is deterministic: the LCS backtrace prefers a deletion on a tie, so the same
// two strings give the same ops on every machine (AC-M1).

import type { ErrorClass } from './classify.js';
import { classify, compareKey, NEARABLE } from './classify.js';
import type { Marking } from './model.js';
import type { LanguagePack } from './presets.js';
import type { DcToken } from './tokens.js';
import { tokens } from './tokens.js';

/** A word the student wrote as expected (under the rules). `w`/`p` — as they wrote it. */
export interface EqOp {
  k: 'eq';
  /** Index of the expected word. */
  i: number;
  w: string;
  p: string;
}

/** A word written instead of the expected one(s). */
export interface SubOp {
  k: 'sub';
  /** Index of the first expected word it stands for. */
  i: number;
  /** Expected words it covers — more than one only for a boundary error. */
  n: number;
  wrote: string;
  expected: string;
  /** Punctuation after the expected word(s). */
  p: string;
  cls: ErrorClass;
  near: boolean;
  focus: boolean;
}

/** An expected word with nothing written for it. */
export interface DelOp {
  k: 'del';
  i: number;
  expected: string;
  p: string;
  focus: boolean;
}

/** A word written that is not in the recording. */
export interface InsOp {
  k: 'ins';
  wrote: string;
  p: string;
}

export type DiffOp = EqOp | SubOp | DelOp | InsOp;

export interface WordCounts {
  /** Expected words. */
  total: number;
  exact: number;
  near: number;
  wrong: number;
  missing: number;
  extra: number;
}

export interface DiffResult {
  ops: DiffOp[];
  words: WordCounts;
  /** 0..1. */
  score: number;
  /**
   * The score's numerator doubled, as an integer — so a pass can be decided in whole numbers
   * (`num2 · 100 ≥ threshold · 2 · total`) rather than on a float that lands a hair under.
   */
  num2: number;
}

type Raw =
  { k: 'eq'; e: DcToken; g: DcToken } | { k: 'del'; e: DcToken } | { k: 'ins'; g: DcToken };

/** Longest boundary expression, in words (`i morgen tidlig` → `imorgentidlig`). */
const BOUNDARY_MAX = 3;

function align(
  E: readonly DcToken[],
  T: readonly DcToken[],
  a: readonly string[],
  b: readonly string[],
): Raw[] {
  const n = a.length;
  const m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
    }
  }
  const raw: Raw[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ k: 'eq', e: E[i]!, g: T[j]! });
      i++;
      j++;
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) {
      raw.push({ k: 'del', e: E[i]! });
      i++;
    } else {
      raw.push({ k: 'ins', g: T[j]! });
      j++;
    }
  }
  while (i < n) raw.push({ k: 'del', e: E[i++]! });
  while (j < m) raw.push({ k: 'ins', g: T[j++]! });
  return raw;
}

const glued = (words: readonly DcToken[]): string => words.map((t) => t.w.toLowerCase()).join('');

export function diff(
  expectedText: string,
  typedText: string,
  marking: Marking,
  focusIdx: Iterable<number>,
  pack: LanguagePack,
): DiffResult {
  const focus = new Set(focusIdx);
  const E = tokens(expectedText);
  const T = tokens(typedText);
  const raw = align(
    E,
    T,
    E.map((t) => compareKey(t, marking, pack)),
    T.map((t) => compareKey(t, marking, pack)),
  );
  const nearAllowed = marking.near !== 'strict';

  const ops: DiffOp[] = [];
  let x = 0;
  while (x < raw.length) {
    const o = raw[x]!;
    if (o.k === 'eq') {
      ops.push({ k: 'eq', i: o.e.i, w: o.g.w, p: o.g.p });
      x++;
      continue;
    }

    // One seam: everything up to the next `eq`.
    const dels: DcToken[] = [];
    const inss: DcToken[] = [];
    while (x < raw.length && raw[x]!.k !== 'eq') {
      const r = raw[x]!;
      if (r.k === 'del') dels.push(r.e);
      else if (r.k === 'ins') inss.push(r.g);
      x++;
    }

    let p = 0;
    let q = 0;
    while (p < dels.length && q < inss.length) {
      const boundary = boundaryAt(dels, p, inss, q);
      if (boundary !== null) {
        const covered = dels.slice(p, p + boundary.dn);
        const wrote = inss.slice(q, q + boundary.gn);
        ops.push({
          k: 'sub',
          i: covered[0]!.i,
          n: covered.length,
          wrote: wrote.map((t) => t.w).join(' '),
          expected: covered.map((t) => t.w).join(' '),
          p: covered[covered.length - 1]!.p,
          cls: 'boundary',
          near: false,
          focus: covered.some((t) => focus.has(t.i)),
        });
        p += boundary.dn;
        q += boundary.gn;
        continue;
      }

      const e = dels[p]!;
      const g = inss[q]!;
      const cls = classify(e, g, marking, pack);
      const isFocus = focus.has(e.i);
      ops.push({
        k: 'sub',
        i: e.i,
        n: 1,
        wrote: g.w,
        expected: e.w,
        p: e.p,
        cls,
        near: nearAllowed && NEARABLE[cls] && !isFocus,
        focus: isFocus,
      });
      p++;
      q++;
    }
    for (; p < dels.length; p++) {
      const e = dels[p]!;
      ops.push({ k: 'del', i: e.i, expected: e.w, p: e.p, focus: focus.has(e.i) });
    }
    for (; q < inss.length; q++) {
      const g = inss[q]!;
      ops.push({ k: 'ins', wrote: g.w, p: g.p });
    }
  }

  const words: WordCounts = { total: E.length, exact: 0, near: 0, wrong: 0, missing: 0, extra: 0 };
  for (const op of ops) {
    if (op.k === 'eq') words.exact++;
    else if (op.k === 'sub' && op.near) words.near++;
    else if (op.k === 'sub') words.wrong++;
    else if (op.k === 'del') words.missing++;
    else words.extra++;
  }

  const extraCost = Math.max(0, Math.round(marking.extraCost));
  const num2 = Math.max(
    0,
    2 * words.exact + (marking.near === 'half' ? words.near : 0) - 2 * words.extra * extraCost,
  );
  const score = words.total === 0 ? 0 : num2 / (2 * words.total);
  return { ops, words, score, num2 };
}

/**
 * A boundary error starting at this point of the seam: 2–3 expected words written as one,
 * or one expected word written as 2–3. Compared lower-case with nothing between the words.
 */
function boundaryAt(
  dels: readonly DcToken[],
  p: number,
  inss: readonly DcToken[],
  q: number,
): { dn: number; gn: number } | null {
  for (let n = 2; n <= BOUNDARY_MAX; n++) {
    if (p + n <= dels.length && glued(dels.slice(p, p + n)) === glued([inss[q]!]))
      return { dn: n, gn: 1 };
    if (q + n <= inss.length && glued(inss.slice(q, q + n)) === glued([dels[p]!]))
      return { dn: 1, gn: n };
  }
  return null;
}

/** Whether a check with this result passes the pass mark — in whole numbers. */
export function passes(result: DiffResult, threshold: number): boolean {
  return result.words.total > 0 && result.num2 * 100 >= threshold * 2 * result.words.total;
}
