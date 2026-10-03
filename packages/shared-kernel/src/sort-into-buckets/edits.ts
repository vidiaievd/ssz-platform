// Every edit the builder can make, as a pure function from document to document.
//
// In the kernel rather than in the form because the cascades are where the bugs live
// (handoff CLAUDE.md, build order 1): deleting a bucket must unassign its items, drop it from
// every `also` and remove every `fb.ov` cell written for it; switching the refusal bucket off
// must do the same for `none`; deleting an item must take its feedback with it. Written once
// here, they are the same cascades whichever screen performs them.
//
// Every function returns a new document and leaves its argument untouched. An edit that is
// not allowed (a sixth bucket, removing one of the last two) returns the document unchanged
// rather than throwing — the builder disables the control, and this is the second line.

import { buckets } from './derive.js';
import type { Bucket, ItemFeedback, Settings, SortIntoBucketsContent, SortItem } from './model.js';
import { newBucket, newItem, SB_MAX_BUCKETS, SB_MIN_BUCKETS, SB_NONE } from './model.js';

type Doc = SortIntoBucketsContent;

// ── Buckets ─────────────────────────────────────────────────────────────────

/** Whether one more bucket fits. The refusal bucket counts toward the five (DECISIONS §2). */
export function canAddBucket(ex: Doc): boolean {
  return buckets(ex).length < SB_MAX_BUCKETS;
}

/** A bucket can be deleted only while more than two authored ones remain (AC-B3). */
export function canRemoveBucket(ex: Doc): boolean {
  return ex.buckets.length > SB_MIN_BUCKETS;
}

/** Whether the refusal bucket can be switched on without passing the cap. */
export function canUseNone(ex: Doc): boolean {
  return ex.useNone || ex.buckets.length < SB_MAX_BUCKETS;
}

export function addBucket(ex: Doc, label = '', rule = ''): Doc {
  if (!canAddBucket(ex)) return ex;
  return { ...ex, buckets: [...ex.buckets, newBucket(label, rule)] };
}

export function updateBucket(ex: Doc, id: string, patch: Partial<Omit<Bucket, 'id'>>): Doc {
  return { ...ex, buckets: ex.buckets.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}

/** Delete a bucket. Items are never deleted — they become unassigned (AC-B4). */
export function removeBucket(ex: Doc, id: string): Doc {
  if (!canRemoveBucket(ex) || !ex.buckets.some((b) => b.id === id)) return ex;
  return forgetBucket({ ...ex, buckets: ex.buckets.filter((b) => b.id !== id) }, id);
}

/** Reorder: changes display order only — no id, explanation or coverage value (AC-B7). */
export function moveBucket(ex: Doc, from: number, to: number): Doc {
  return { ...ex, buckets: move(ex.buckets, from, to) };
}

/**
 * Replace the authored buckets with a starter set (presets.ts).
 *
 * The old buckets go through the same cascade as a deletion, so items that pointed at them
 * come back unassigned rather than pointing at nothing.
 */
export function replaceBuckets(ex: Doc, next: ReadonlyArray<readonly [label: string, rule: string]>): Doc {
  const fresh = next.slice(0, SB_MAX_BUCKETS - (ex.useNone ? 1 : 0)).map(([l, r]) => newBucket(l, r));
  let out: Doc = { ...ex, buckets: fresh };
  for (const old of ex.buckets) out = forgetBucket(out, old.id);
  return out;
}

/**
 * Switch the refusal bucket. Off unassigns every item that sat in it — it does not delete
 * them, and the resulting `SB_ITEM_UNASSIGNED` is how the builder says so (AC-B6).
 */
export function setUseNone(ex: Doc, on: boolean): Doc {
  if (on === ex.useNone) return ex;
  if (on) return canUseNone(ex) ? { ...ex, useNone: true } : ex;
  return forgetBucket({ ...ex, useNone: false }, SB_NONE);
}

export function setNoneLabel(ex: Doc, noneLabel: string): Doc {
  return { ...ex, noneLabel };
}

/** Remove every trace of a bucket from the items and the feedback. */
function forgetBucket(ex: Doc, id: string): Doc {
  const items = ex.items.map((item) => {
    const also = item.also.filter((b) => b !== id);
    const bucketId = item.bucketId === id ? null : item.bucketId;
    return also.length === item.also.length && bucketId === item.bucketId
      ? item
      : { ...item, bucketId, also };
  });

  const fb: Doc['fb'] = {};
  for (const [itemId, entry] of Object.entries(ex.fb)) {
    if (!(id in entry.ov)) {
      fb[itemId] = entry;
      continue;
    }
    const ov = { ...entry.ov };
    delete ov[id];
    fb[itemId] = { ...entry, ov };
  }

  return { ...ex, items, fb };
}

// ── Items ───────────────────────────────────────────────────────────────────

export function addItem(ex: Doc, text = '', bucketId: string | null = null): Doc {
  return { ...ex, items: [...ex.items, newItem(text, bucketId)] };
}

export function updateItem(
  ex: Doc,
  id: string,
  patch: Partial<Pick<SortItem, 'text' | 'why' | 'mediaId' | 'audio'>>,
): Doc {
  return { ...ex, items: ex.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

/** Delete an item and its feedback with it (AC-I8). */
export function removeItem(ex: Doc, id: string): Doc {
  if (!ex.items.some((i) => i.id === id)) return ex;
  const fb = { ...ex.fb };
  delete fb[id];
  return { ...ex, items: ex.items.filter((i) => i.id !== id), fb };
}

/** Reorder: explanations are keyed by id and stay with their item (AC-I3). */
export function moveItem(ex: Doc, from: number, to: number): Doc {
  return { ...ex, items: move(ex.items, from, to) };
}

/**
 * Click a bucket pill. The primary bucket clicked again unassigns the item (AC-I1); a new
 * primary leaves `also`, so no bucket is accepted twice (AC-I2).
 */
export function assignBucket(ex: Doc, itemId: string, bucketId: string): Doc {
  return mapItem(ex, itemId, (item) =>
    item.bucketId === bucketId
      ? { ...item, bucketId: null }
      : { ...item, bucketId, also: item.also.filter((b) => b !== bucketId) },
  );
}

/** Tick or untick an additionally accepted bucket. Never the primary, never on an unassigned item. */
export function toggleAlso(ex: Doc, itemId: string, bucketId: string): Doc {
  return mapItem(ex, itemId, (item) => {
    if (item.bucketId === null || item.bucketId === bucketId) return item;
    const also = item.also.includes(bucketId)
      ? item.also.filter((b) => b !== bucketId)
      : [...item.also, bucketId];
    return { ...item, also };
  });
}

/**
 * Add parsed items (bulk.ts). Blank items are dropped first, so pasting into the scaffold
 * does not leave its three empty rows standing above the list.
 */
export function appendItems(ex: Doc, items: readonly SortItem[]): Doc {
  const kept = ex.items.filter((i) => i.text.trim() !== '' || i.bucketId !== null);
  return { ...ex, items: [...kept, ...items] };
}

// ── Feedback ────────────────────────────────────────────────────────────────

/** The required default: why a wrong bucket is wrong for this item. */
export function setDefaultFeedback(ex: Doc, itemId: string, def: string): Doc {
  return mapFeedback(ex, itemId, (fb) => ({ ...fb, def }));
}

/** A text for one (item × wrong bucket) cell. Empty text removes the cell. */
export function setOverride(ex: Doc, itemId: string, bucketId: string, text: string): Doc {
  return mapFeedback(ex, itemId, (fb) => {
    const ov = { ...fb.ov };
    if (text.trim() === '') delete ov[bucketId];
    else ov[bucketId] = text;
    return { ...fb, ov };
  });
}

// ── Settings ────────────────────────────────────────────────────────────────

/** Step 4. Touches no field of `buckets` or `items` (AC-D4). */
export function updateSettings(ex: Doc, patch: Partial<Settings>): Doc {
  return { ...ex, settings: { ...ex.settings, ...patch } };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapItem(ex: Doc, id: string, fn: (item: SortItem) => SortItem): Doc {
  return { ...ex, items: ex.items.map((i) => (i.id === id ? fn(i) : i)) };
}

function mapFeedback(ex: Doc, itemId: string, fn: (fb: ItemFeedback) => ItemFeedback): Doc {
  if (!ex.items.some((i) => i.id === itemId)) return ex;
  const current = ex.fb[itemId] ?? { def: '', ov: {} };
  return { ...ex, fb: { ...ex.fb, [itemId]: fn(current) } };
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) {
    return [...list];
  }
  const out = [...list];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved as T);
  return out;
}
