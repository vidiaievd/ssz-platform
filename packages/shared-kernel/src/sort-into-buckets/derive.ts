// Derived values. Nothing here is stored — the handoff's rule 5: store what the teacher
// typed, derive buckets-with-refusal, balance, coverage and validity.

import type { Bucket, SortIntoBucketsContent, SortItem } from './model.js';
import { SB_NONE, SB_SKEW_MIN_ITEMS, SB_SKEW_SHARE } from './model.js';

/** A bucket as the student sees it: the authored ones, then the refusal bucket. */
export interface ShownBucket extends Bucket {
  refusal: boolean;
}

/** Normalisation for every duplicate check: trim → collapse whitespace → lowercase. */
export function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The authored buckets plus the refusal bucket when it is on. */
export function buckets(ex: SortIntoBucketsContent): ShownBucket[] {
  const out: ShownBucket[] = ex.buckets.map((b) => ({ ...b, refusal: false }));
  if (ex.useNone) out.push({ id: SB_NONE, label: ex.noneLabel, rule: '', refusal: true });
  return out;
}

export function bucket(ex: SortIntoBucketsContent, id: string | null): ShownBucket | null {
  if (id === null) return null;
  return buckets(ex).find((b) => b.id === id) ?? null;
}

/** `[bucketId, ...also]` — every bucket the item is correct in. */
export function accepted(item: SortItem): string[] {
  if (item.bucketId === null) return [];
  return [item.bucketId, ...item.also.filter((id) => id !== item.bucketId)];
}

/** The membership test used by grading and by the matrix. */
export function accepts(item: SortItem, bucketId: string): boolean {
  return accepted(item).includes(bucketId);
}

/** Items with text, whether or not they are assigned. */
export function writtenItems(ex: SortIntoBucketsContent): SortItem[] {
  return ex.items.filter((i) => i.text.trim() !== '');
}

/**
 * Items with text and a bucket that exists — the ones the student sees.
 *
 * "Exists" rather than "is set": a document read back from storage can carry a `bucketId`
 * whose bucket was removed outside the cascades in edits.ts. Such an item is unassigned in
 * every sense that matters, and issues.ts says so.
 */
export function readyItems(ex: SortIntoBucketsContent): SortItem[] {
  const live = new Set(buckets(ex).map((b) => b.id));
  return writtenItems(ex).filter((i) => i.bucketId !== null && live.has(i.bucketId));
}

/** Ready items whose *primary* bucket is this one — the balance meter's count. */
export function itemsIn(ex: SortIntoBucketsContent, bucketId: string): SortItem[] {
  return readyItems(ex).filter((i) => i.bucketId === bucketId);
}

export interface Cell {
  itemId: string;
  bucketId: string;
}

/** Every (ready item × bucket it does not accept) — the matrix domain. */
export function cells(ex: SortIntoBucketsContent): Cell[] {
  const shown = buckets(ex);
  return readyItems(ex).flatMap((item) =>
    shown.filter((b) => !accepts(item, b.id)).map((b) => ({ itemId: item.id, bucketId: b.id })),
  );
}

export interface Coverage {
  /** Cells that could carry a text of their own. */
  total: number;
  /** Cells that do. */
  written: number;
  /** Ready items without the required default — each one a blocker. */
  noDefault: number;
}

export function coverage(ex: SortIntoBucketsContent): Coverage {
  const all = cells(ex);
  const written = all.filter((c) => (ex.fb[c.itemId]?.ov[c.bucketId] ?? '').trim() !== '').length;
  const noDefault = readyItems(ex).filter((i) => (ex.fb[i.id]?.def ?? '').trim() === '').length;
  return { total: all.length, written, noDefault };
}

/** The explanation for putting this item in this bucket: the override, else the default. */
export function feedbackFor(ex: SortIntoBucketsContent, itemId: string, bucketId: string): string {
  const fb = ex.fb[itemId];
  const own = fb?.ov[bucketId]?.trim() ?? '';
  return own !== '' ? own : (fb?.def.trim() ?? '');
}

export interface BucketBalance {
  bucketId: string;
  count: number;
  /** 0-1 of the ready items. 0 when there are none. */
  share: number;
}

/** One entry per shown bucket, in display order — the step 2 meter. */
export function balance(ex: SortIntoBucketsContent): BucketBalance[] {
  const total = readyItems(ex).length;
  return buckets(ex).map((b) => {
    const count = itemsIn(ex, b.id).length;
    return { bucketId: b.id, count, share: total === 0 ? 0 : count / total };
  });
}

/**
 * Whether one bucket holds over 60 % of at least six items.
 *
 * Read by issues.ts (a warning) and by the engine (plan 66 Q2-B): a skewed exercise is one a
 * student passes by dumping everything in one place, so its evidence ceiling drops.
 */
export function isSkewed(ex: SortIntoBucketsContent): boolean {
  const total = readyItems(ex).length;
  if (total < SB_SKEW_MIN_ITEMS) return false;
  return balance(ex).some((b) => b.share > SB_SKEW_SHARE);
}

/**
 * The first clause of a rule — what the student sees under a bucket's label as a hint.
 *
 * Cut at the first sentence or clause mark (`.` `;` `:` or a spaced dash). A rule written as
 * one short clause comes back whole.
 */
export function firstClause(rule: string): string {
  const text = rule.trim();
  const match = /[.;:]|\s[—–-]\s/.exec(text);
  return (match ? text.slice(0, match.index) : text).trim();
}
