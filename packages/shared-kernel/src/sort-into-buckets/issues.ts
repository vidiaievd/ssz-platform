// The validation engine for `sort_into_buckets` — SPEC_data_model §Issues.
//
// One list drives three places: the rail dots, the inline callouts in each step and the
// gate; the server's publish preflight reads it too (BEHAVIOR §Validation surfaces). Rules
// re-derived per screen are how a builder drifts from itself. `blocker` is reserved for
// what makes the exercise physically unplayable (plan 55 §12.6).
//
// Issues carry a code and the parameters a message needs, never the message: the teacher
// UI is translated into four languages. And every issue that is about one bucket or one
// item names it by id — the prototype counted instead ("2 items have no bucket"), which
// cannot be drawn under the row it belongs to (deviation 11 of plan 66 §5).
//
// Ported by behaviour, not by code (plan 66 §4.2): the prototype's thin-bucket check is an
// average, its duplicate check ignores the refusal label, and its step state never reaches
// `empty`. Each is corrected below where it happens.

import {
  buckets,
  ceilingCause,
  isSkewed,
  itemsIn,
  normalize,
  readyItems,
  writtenItems,
} from './derive.js';
import type { CeilingCause } from './derive.js';
import type { SortIntoBucketsContent } from './model.js';
import {
  SB_LONG_ITEM_WORDS,
  SB_MAX_BUCKETS,
  SB_MIN_BUCKETS,
  SB_MIN_PER_BUCKET,
  SB_MIN_READY_ITEMS,
  SB_MULTI_HEAVY_SHARE,
  SB_SKEW_SHARE,
} from './model.js';

// `info` is part of the vocabulary and currently unused (SPEC_data_model §Issues).
export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's jump links both use it. */
export type IssueStep = 1 | 2 | 3 | 4;

export type Issue =
  // ── Step 1 — buckets ──
  | { code: 'SB_BUCKETS_TOO_FEW'; level: 'blocker'; step: 1; count: number }
  | { code: 'SB_BUCKET_UNLABELLED'; level: 'blocker'; step: 1; bucketId: string }
  | { code: 'SB_BUCKET_LABEL_DUPLICATE'; level: 'blocker'; step: 1; bucketId: string }
  | { code: 'SB_BUCKETS_TOO_MANY'; level: 'blocker'; step: 1; count: number }
  // ── Step 2 — items ──
  | { code: 'SB_ITEM_UNASSIGNED'; level: 'blocker'; step: 2; itemId: string }
  | { code: 'SB_ITEMS_TOO_FEW'; level: 'blocker'; step: 2; count: number }
  | { code: 'SB_ITEM_DUPLICATE'; level: 'blocker'; step: 2; itemId: string }
  | { code: 'SB_BUCKET_EMPTY'; level: 'blocker'; step: 2; bucketId: string }
  | { code: 'SB_THIN_BUCKETS'; level: 'warning'; step: 2; bucketId: string; count: number }
  | { code: 'SB_SKEWED'; level: 'warning'; step: 2; bucketId: string; share: number }
  | { code: 'SB_MULTI_HEAVY'; level: 'warning'; step: 2; count: number; total: number }
  | { code: 'SB_ITEM_LONG'; level: 'warning'; step: 2; itemId: string; words: number }
  // ── Step 3 — feedback ──
  | { code: 'SB_NO_EXPLANATION'; level: 'blocker'; step: 3; itemId: string }
  | { code: 'SB_BUCKET_NO_RULE'; level: 'warning'; step: 3; bucketId: string }
  // ── Step 4 — difficulty ──
  | { code: 'SB_COUNTER_ARITHMETIC'; level: 'warning'; step: 4 }
  | { code: 'SB_ONE_SHOT_KEY'; level: 'warning'; step: 4 }
  | { code: 'SB_CEILING_LOWERED'; level: 'warning'; step: 4; cause: CeilingCause };

export type IssueCode = Issue['code'];

/** Everything wrong with the document, in authoring order: step 1, then 2, 3, 4. */
export function issues(ex: SortIntoBucketsContent): Issue[] {
  const out: Issue[] = [];
  const shown = buckets(ex);
  const labelled = ex.buckets.filter((b) => b.label.trim() !== '');
  const ready = readyItems(ex);

  // ── Step 1 ────────────────────────────────────────────────────────────────
  // The refusal bucket is not a category, so it does not make up the minimum of two.
  if (labelled.length < SB_MIN_BUCKETS) {
    out.push({ code: 'SB_BUCKETS_TOO_FEW', level: 'blocker', step: 1, count: labelled.length });
  }
  for (const b of shown) {
    if (b.label.trim() === '') {
      out.push({ code: 'SB_BUCKET_UNLABELLED', level: 'blocker', step: 1, bucketId: b.id });
    }
  }
  // The refusal bucket takes part: it is a zone the student reads like any other, and
  // «Ingen» beside «ingen» is two zones nobody can tell apart. The second occurrence is
  // flagged — the one the author most likely meant to change.
  const seen = new Set<string>();
  for (const b of shown) {
    const label = normalize(b.label);
    if (label === '') continue;
    if (seen.has(label)) {
      out.push({ code: 'SB_BUCKET_LABEL_DUPLICATE', level: 'blocker', step: 1, bucketId: b.id });
    }
    seen.add(label);
  }
  if (shown.length > SB_MAX_BUCKETS) {
    out.push({ code: 'SB_BUCKETS_TOO_MANY', level: 'blocker', step: 1, count: shown.length });
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const readyIds = new Set(ready.map((i) => i.id));
  for (const item of writtenItems(ex)) {
    if (!readyIds.has(item.id)) {
      out.push({ code: 'SB_ITEM_UNASSIGNED', level: 'blocker', step: 2, itemId: item.id });
    }
  }

  // Unconditional, including on the untouched scaffold: an empty board must never be
  // publishable. `stepState` is what keeps the rail from shouting at a new document.
  if (ready.length < SB_MIN_READY_ITEMS) {
    out.push({ code: 'SB_ITEMS_TOO_FEW', level: 'blocker', step: 2, count: ready.length });
  }

  const seenText = new Set<string>();
  for (const item of ready) {
    const text = normalize(item.text);
    if (seenText.has(text)) {
      out.push({ code: 'SB_ITEM_DUPLICATE', level: 'blocker', step: 2, itemId: item.id });
    }
    seenText.add(text);
  }

  // Guarded as the prototype guards it: until two buckets are named there is no
  // classification to have an empty side of, and SB_BUCKETS_TOO_FEW already says so.
  if (labelled.length >= SB_MIN_BUCKETS) {
    for (const b of ex.buckets) {
      if (itemsIn(ex, b.id).length === 0) {
        out.push({ code: 'SB_BUCKET_EMPTY', level: 'blocker', step: 2, bucketId: b.id });
      }
    }
  }

  // Per bucket, as the spec says ("fewer than 2 items per bucket"); the prototype took an
  // average, which lets one starved bucket hide behind a full one. An empty bucket is the
  // blocker above, so this starts at one.
  if (ready.length > 0) {
    for (const b of ex.buckets) {
      const count = itemsIn(ex, b.id).length;
      if (count > 0 && count < SB_MIN_PER_BUCKET) {
        out.push({ code: 'SB_THIN_BUCKETS', level: 'warning', step: 2, bucketId: b.id, count });
      }
    }
  }

  if (isSkewed(ex)) {
    for (const b of shown) {
      const share = itemsIn(ex, b.id).length / ready.length;
      if (share > SB_SKEW_SHARE) {
        out.push({ code: 'SB_SKEWED', level: 'warning', step: 2, bucketId: b.id, share });
      }
    }
  }

  const multi = ready.filter((i) => i.also.some((b) => b !== i.bucketId)).length;
  if (multi > 0 && multi / ready.length > SB_MULTI_HEAVY_SHARE) {
    out.push({ code: 'SB_MULTI_HEAVY', level: 'warning', step: 2, count: multi, total: ready.length });
  }

  for (const item of ready) {
    const words = item.text.trim().split(/\s+/).length;
    if (words > SB_LONG_ITEM_WORDS) {
      out.push({ code: 'SB_ITEM_LONG', level: 'warning', step: 2, itemId: item.id, words });
    }
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  for (const item of ready) {
    if ((ex.fb[item.id]?.def ?? '').trim() === '') {
      out.push({ code: 'SB_NO_EXPLANATION', level: 'blocker', step: 3, itemId: item.id });
    }
  }
  for (const b of labelled) {
    if (b.rule.trim() === '') {
      out.push({ code: 'SB_BUCKET_NO_RULE', level: 'warning', step: 3, bucketId: b.id });
    }
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  if (ex.settings.showRemaining && !ex.useNone) {
    out.push({ code: 'SB_COUNTER_ARITHMETIC', level: 'warning', step: 4 });
  }
  // The evidence ceiling is said apart from the arithmetic above: a refusal bucket silences
  // that one, but the engine lowers the ceiling all the same (plan 66 phase 9, finding 1).
  const cause = ceilingCause(ex);
  if (cause !== null) {
    out.push({ code: 'SB_CEILING_LOWERED', level: 'warning', step: 4, cause });
  }
  if (ex.settings.attempts === 1 && ex.settings.revealKey) {
    out.push({ code: 'SB_ONE_SHOT_KEY', level: 'warning', step: 4 });
  }

  return out;
}

/** Whether the exercise may be published or assigned — the gate's and the preflight's question. */
export function isReady(ex: SortIntoBucketsContent): boolean {
  return !issues(ex).some((i) => i.level === 'blocker');
}

export function blockers(ex: SortIntoBucketsContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'blocker');
}

export function warnings(ex: SortIntoBucketsContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'warning');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/**
 * The rail dot for a step — `ok` green, `warn` amber, `empty` dashed, `err` with a count.
 *
 * `empty` is checked **before** the blockers, and that is the one judgement here. The
 * scaffold carries blockers on steps 1 and 2 from the moment it exists — no labelled bucket,
 * no ready item — and a new exercise opening onto red badges is the builder telling an
 * author off for arriving. The prototype's own `sbStepState` checks `err` first, which makes
 * its dashed dot unreachable (the same defect plan 54 found in `mcg`, deviation 5). The gate
 * and the preflight still refuse the document: they read `issues`, not this.
 *
 *   step 1 — empty while no bucket has a label or a rule and the title is blank;
 *   step 2 — empty while no item has text;
 *   step 3 — empty while no item is ready: there is nothing to explain yet;
 *   step 4 — never: it is settings, and they exist from the start.
 */
export function stepState(ex: SortIntoBucketsContent, step: IssueStep): StepState {
  if (isUntouched(ex, step)) return { s: 'empty', errs: 0 };

  const own = issues(ex).filter((i) => i.step === step);
  const errs = own.filter((i) => i.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (own.length > 0) return { s: 'warn', errs: 0 };
  return { s: 'ok', errs: 0 };
}

function isUntouched(ex: SortIntoBucketsContent, step: IssueStep): boolean {
  if (step === 1) {
    return (
      ex.title.trim() === '' &&
      ex.buckets.every((b) => b.label.trim() === '' && b.rule.trim() === '')
    );
  }
  if (step === 2) return writtenItems(ex).length === 0;
  if (step === 3) return readyItems(ex).length === 0;
  return false;
}
