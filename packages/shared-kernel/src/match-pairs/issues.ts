// The validation engine for `match_pairs` — BEHAVIOR.md §1.6, "one engine, three
// surfaces": the builder's rail dots, its field errors, and the pre-assign gate all read
// this list, and so does the server on save and on publish pre-flight. One function, so
// that AC-X1 — client and server return the same codes for the same document — holds by
// construction rather than by review.
//
// Issues carry a code and the parameters its message needs, never the message itself.
// The teacher UI is localised into four languages (en · nb · uk · ru), so English prose
// in shared logic could not be rendered. The renderer owns the words.

import type { MatchPairs, PairId, Variant } from './model.js';
import { completePairs, coverage, feedbackFor, norm, rightItems } from './selectors.js';

export type IssueLevel = 'blocker' | 'warning';

/** Which builder step owns the fix. Rail dots and the gate's deep links both use it. */
export type IssueStep = 1 | 2 | 3;

/** Fewer than this many complete pairs and there is no exercise yet (BEHAVIOR §1.6). */
const MIN_PAIRS = 3;

/** Below this, with no extras, the last match is free — elimination solves it. */
const FREE_LAST_MATCH_BELOW = 6;

/** A right half longer than this reads badly in a phone-width chip. */
const LONG_RIGHT_WORDS = 12;

export type Issue =
  | { code: 'EX_NO_TITLE'; level: 'blocker'; step: 1 }
  | { code: 'PAIR_HALF_EMPTY'; level: 'blocker'; step: 1; pairId: PairId; pairIndex: number }
  | { code: 'EX_TOO_FEW_PAIRS'; level: 'blocker'; step: 1; pairCount: number; required: number }
  | { code: 'PAIR_LEFT_DUPLICATE'; level: 'warning'; step: 1; pairId: PairId; pairIndex: number }
  | {
      code: 'PAIR_RIGHT_LONG';
      level: 'warning';
      step: 1;
      pairId: PairId;
      pairIndex: number;
      wordCount: number;
    }
  | { code: 'POOL_DUPLICATE'; level: 'blocker'; step: 2; text: string }
  | { code: 'POOL_NO_DISTRACTORS'; level: 'warning'; step: 2 }
  | { code: 'POOL_TOO_SMALL'; level: 'warning'; step: 2; pairCount: number }
  // The only code whose level depends on the document — see `defaultExplanationLevel`.
  | { code: 'FB_NO_DEFAULT'; level: IssueLevel; step: 3; pairId: PairId; pairIndex: number };

export type IssueCode = Issue['code'];

/**
 * How hard a missing default explanation bites, which is not the same question for the
 * two variants.
 *
 * For `halves` it is the spec's blocker, and rightly: the student attached the wrong
 * half because of grammar they cannot see unaided ("after «fordi» the subject stays
 * first"), and without the teacher's sentence they learn only that they were wrong.
 *
 * For `pairs` — `fordi` ↔ `потому что` — the required text would say what is already on
 * the screen. Making it a blocker there would refuse publication of every existing
 * course over prose nobody needs to read: a `blocker` from this engine reaches
 * `publish-version.handler.ts` and stops the whole container version, not one exercise.
 *
 * See docs/plan/49-match-pairs.md, "Почему FB_NO_DEFAULT не может быть блокером везде".
 */
export function defaultExplanationLevel(variant: Variant): IssueLevel {
  return variant === 'halves' ? 'blocker' : 'warning';
}

/**
 * Every problem with the document, in authoring order: step 1, then 2, then 3, and
 * within a step in the order the teacher would meet them.
 *
 * The order is part of the contract, not a detail — AC-X1 compares the client's list with
 * the server's, and a set comparison would hide a real disagreement about which pair is
 * at fault.
 */
export function issues(ex: MatchPairs): Issue[] {
  const out: Issue[] = [];
  const complete = completePairs(ex);

  // ── Step 1 — the pairs ───────────────────────────────────────────────────
  if (ex.title.trim() === '') out.push({ code: 'EX_NO_TITLE', level: 'blocker', step: 1 });

  ex.pairs.forEach((pair, pairIndex) => {
    const left = pair.left.trim();
    const right = pair.right.trim();
    // Exactly one half written. Both empty is a row not yet typed, and silent by design.
    if ((left === '') !== (right === '')) {
      out.push({ code: 'PAIR_HALF_EMPTY', level: 'blocker', step: 1, pairId: pair.id, pairIndex });
    }
  });

  if (complete.length < MIN_PAIRS) {
    out.push({
      code: 'EX_TOO_FEW_PAIRS',
      level: 'blocker',
      step: 1,
      pairCount: complete.length,
      required: MIN_PAIRS,
    });
  }

  // Reported on the second and any later occurrence: the first one is not the mistake,
  // and flagging it would put an error on a row the teacher has no reason to change.
  const seenLeft = new Set<string>();
  ex.pairs.forEach((pair, pairIndex) => {
    const left = norm(pair.left);
    if (left === '') return;
    if (seenLeft.has(left)) {
      out.push({
        code: 'PAIR_LEFT_DUPLICATE',
        level: 'warning',
        step: 1,
        pairId: pair.id,
        pairIndex,
      });
    }
    seenLeft.add(left);
  });

  ex.pairs.forEach((pair, pairIndex) => {
    const wordCount = pair.right.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > LONG_RIGHT_WORDS) {
      out.push({
        code: 'PAIR_RIGHT_LONG',
        level: 'warning',
        step: 1,
        pairId: pair.id,
        pairIndex,
        wordCount,
      });
    }
  });

  // ── Step 2 — the right column ────────────────────────────────────────────
  //
  // Two halves that read the same are a blocker wherever they come from: the student
  // cannot tell them apart, so whichever one they pick, the grade is a coin toss.
  // Checked against the live pool, so a duplicate hiding in a switched-off distractor
  // is not reported as an error the teacher cannot see.
  const seenText = new Set<string>();
  for (const item of rightItems(ex)) {
    const text = norm(item.text);
    if (text === '') continue;
    if (seenText.has(text)) {
      out.push({ code: 'POOL_DUPLICATE', level: 'blocker', step: 2, text: item.text.trim() });
    }
    seenText.add(text);
  }

  const writtenDistractors = ex.distractors.filter((d) => d.text.trim() !== '').length;
  if (ex.settings.distractors && writtenDistractors === 0 && complete.length > 0) {
    // The pool then equals the answers, and the last match solves itself.
    out.push({ code: 'POOL_NO_DISTRACTORS', level: 'warning', step: 2 });
  } else if (!ex.settings.distractors && complete.length > 0 && complete.length < FREE_LAST_MATCH_BELOW) {
    out.push({ code: 'POOL_TOO_SMALL', level: 'warning', step: 2, pairCount: complete.length });
  }

  // ── Step 3 — explanations ────────────────────────────────────────────────
  const level = defaultExplanationLevel(ex.variant);
  ex.pairs.forEach((pair, pairIndex) => {
    if (pair.left.trim() === '' || pair.right.trim() === '') return;
    if (feedbackFor(ex, pair.id).def.trim() === '') {
      out.push({ code: 'FB_NO_DEFAULT', level, step: 3, pairId: pair.id, pairIndex });
    }
  });

  return out;
}

/**
 * Whether the exercise may be assigned. False exactly when a blocker exists.
 *
 * Readiness is not a stored field: the platform already has container versioning and
 * pre-flight, and a second readiness model would contend with it. This is a question you
 * ask the document, not a flag you set on it.
 */
export function isReady(ex: MatchPairs): boolean {
  return !issues(ex).some((issue) => issue.level === 'blocker');
}

export function blockers(ex: MatchPairs): Issue[] {
  return issues(ex).filter((issue) => issue.level === 'blocker');
}

export function warnings(ex: MatchPairs): Issue[] {
  return issues(ex).filter((issue) => issue.level === 'warning');
}

/**
 * The rail dot for one step: what the teacher sees before opening it.
 *
 * `empty` is not "fine" — it is "nothing written yet", which the rail draws as a dashed
 * outline rather than a green tick, because a step nobody has visited is not a step that
 * passed.
 */
export function stepState(
  ex: MatchPairs,
  step: IssueStep,
): { state: 'blocker' | 'warning' | 'ok' | 'empty'; count: number } {
  const mine = issues(ex).filter((issue) => issue.step === step);
  const blocking = mine.filter((issue) => issue.level === 'blocker').length;
  if (blocking > 0) return { state: 'blocker', count: blocking };

  const warned = mine.length;
  if (warned > 0) return { state: 'warning', count: warned };

  if (isStepEmpty(ex, step)) return { state: 'empty', count: 0 };
  return { state: 'ok', count: 0 };
}

function isStepEmpty(ex: MatchPairs, step: IssueStep): boolean {
  if (step === 1) return completePairs(ex).length === 0;
  if (step === 2) return ex.distractors.every((distractor) => distractor.text.trim() === '');
  const { written, noDefault } = coverage(ex);
  return written === 0 && noDefault === completePairs(ex).length;
}
