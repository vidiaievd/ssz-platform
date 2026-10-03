// Grading for `sort_into_buckets`: the whole board at once, and what a check leaves behind.
//
// One `Sjekk` sends every placement (DECISIONS §5). Its result decides, at the same time,
// the score, which items lock, whether the board is closed, and how much of the key the
// student may see. It runs on the server over the server's document — the client supplies
// placements and nothing else; the key, the settings and which items are even shown come
// from `ex`.
//
// ── The score is the first check ────────────────────────────────────────────
// What the engine records is **first-check accuracy over all ready items**: an item the
// student did not place on the first check counts as wrong, not as an abstention
// (SPEC_api_contract §Grading — the defence against dumping everything into the largest
// bucket; plan 66 Q5-A). Later checks change what the student sees — which tiles lock,
// which explanations appear — and never the score. The server carries the first placement
// of every item forward from check to check (`firstBuckets`), the way plan 54 carries
// `firstAnswer`, so the number survives re-checks that overwrite the attempt's details.
//
// ── How much of the key a check returns ─────────────────────────────────────
//   * whether each placed item is right — on every check, it is the point of checking;
//   * for a wrong item, the explanation for *that* bucket: `fb.ov[chosen] ?? fb.def`;
//   * the primary bucket, each item's `why` and each bucket's rule — only once the board is
//     closed (all right, revealed, or out of checks) **and** `revealKey` is on. Sending the
//     answer beside a wrong tile that still has a retry left would make the retry theatre.

import { accepts, buckets, feedbackFor, readyItems } from './derive.js';
import type { SortIntoBucketsContent } from './model.js';
import { maxChecks } from './model.js';

/** One tile in one zone, as the client sends it. Unplaced items are simply absent. */
export interface Placement {
  itemId: string;
  bucketId: string;
}

export interface CheckInput {
  ex: SortIntoBucketsContent;
  placements: readonly Placement[];
  /** 1-based: which check of the board this is. */
  attempt: number;
  /** The student asked for «Vis riktig plassering» — the board closes. */
  reveal?: boolean;
  /** Items an earlier check found right. They stay right and stay put. */
  locked?: readonly string[];
  /**
   * Where each item was on the first check, carried forward by the server. Absent on the
   * first check, and on a later one only if the attempt lost its details — in which case
   * this check stands in for the first.
   */
  firstBuckets?: Readonly<Record<string, string | null>>;
}

export interface ItemOutcome {
  /** The item id — also its `itemKey` for addressing and review. */
  itemKey: string;
  /** Where it is now; `null` when unplaced. */
  chosenBucketId: string | null;
  /** Right now. */
  ok: boolean;
  /** Right on the first check — what the score counts. */
  firstOk: boolean;
  /** Why the chosen bucket is wrong. Only on a placed, wrong item, and only when written. */
  explanation?: string;
  /** The primary bucket. Only once the board is closed and `revealKey` is on. */
  correctBucketId?: string;
  /** Why it belongs there. Same condition as `correctBucketId`, and only when written. */
  why?: string;
}

export interface BucketRule {
  bucketId: string;
  rule: string;
}

export interface CheckResult {
  items: ItemOutcome[];
  /** Each bucket's rule. Same condition as `correctBucketId`; empty otherwise. */
  rules: BucketRule[];
  /** Items right on the first check. */
  correct: number;
  /** Items right now — the summary line and the live region. */
  correctNow: number;
  /** Ready items. */
  total: number;
  /** 0-100, rounded, over the first check. */
  pct: number;
  /** `pct >= threshold`, and never after a reveal (AC-S8). */
  passed: boolean;
  attempt: number;
  /** Checks still allowed after this one, or `null` for unlimited. */
  checksLeft: number | null;
  /** No further check: all right, revealed, or out of checks. */
  closed: boolean;
  revealed: boolean;
  /** Cumulative: every item found right on any check so far. */
  locked: string[];
  /** To be carried into the next check. */
  firstBuckets: Record<string, string | null>;
}

export function check(input: CheckInput): CheckResult {
  const { ex, attempt } = input;
  const s = ex.settings;
  const ready = readyItems(ex);
  const shown = new Set(buckets(ex).map((b) => b.id));
  const already = new Set(input.locked ?? []);

  // Last placement wins; a placement for an unknown item or into an unknown zone is
  // dropped — it is a client bug, and the item reads as unplaced.
  const placed = new Map<string, string>();
  for (const p of input.placements) {
    if (shown.has(p.bucketId)) placed.set(p.itemId, p.bucketId);
  }

  const first = input.firstBuckets;
  const firstBuckets: Record<string, string | null> = {};

  const graded = ready.map((item) => {
    const sent = placed.get(item.id) ?? null;
    // A locked tile cannot move. What the client sent for it is ignored unless it is
    // still a bucket the item accepts; otherwise it stands where it was right — its primary.
    const chosen = already.has(item.id)
      ? sent !== null && accepts(item, sent)
        ? sent
        : item.bucketId
      : sent;
    const ok = chosen !== null && accepts(item, chosen);

    const firstChosen = first !== undefined && item.id in first ? (first[item.id] ?? null) : chosen;
    firstBuckets[item.id] = firstChosen;
    const firstOk = firstChosen !== null && accepts(item, firstChosen);

    return { item, chosen, ok, firstOk };
  });

  const total = graded.length;
  const correct = graded.filter((g) => g.firstOk).length;
  const correctNow = graded.filter((g) => g.ok).length;
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);

  const max = maxChecks(s);
  const checksLeft = max === null ? null : Math.max(0, max - attempt);
  const revealed = input.reveal === true;
  const closed = (total > 0 && correctNow === total) || revealed || checksLeft === 0;
  const showKey = closed && s.revealKey;

  const items = graded.map(({ item, chosen, ok, firstOk }): ItemOutcome => {
    const outcome: ItemOutcome = { itemKey: item.id, chosenBucketId: chosen, ok, firstOk };
    if (!ok && chosen !== null) {
      const explanation = feedbackFor(ex, item.id, chosen);
      if (explanation !== '') outcome.explanation = explanation;
    }
    if (showKey && item.bucketId !== null) {
      outcome.correctBucketId = item.bucketId;
      if (item.why.trim() !== '') outcome.why = item.why.trim();
    }
    return outcome;
  });

  const rules = showKey
    ? buckets(ex)
        .filter((b) => b.rule.trim() !== '')
        .map((b) => ({ bucketId: b.id, rule: b.rule.trim() }))
    : [];

  const locked = [...new Set([...already, ...graded.filter((g) => g.ok).map((g) => g.item.id)])];

  return {
    items,
    rules,
    correct,
    correctNow,
    total,
    pct,
    passed: !revealed && pct >= s.threshold,
    attempt,
    checksLeft,
    closed,
    revealed,
    locked,
    firstBuckets,
  };
}
