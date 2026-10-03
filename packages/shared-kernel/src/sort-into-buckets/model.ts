// Model for the `sort_into_buckets` exercise.
//
// Source of truth: docs/design/activity-specs/01_design_handoff_sort_into_buckets/ in
// ssz-platform-web, as amended by docs/plan/66-sort-into-buckets.md.
//
// N items into 2-5 labelled buckets — "classify", where `match_pairs` is "find the partner".
// Two ideas from the handoff shape everything here:
//
//   1. **An item is written once and clicked into its bucket.** `item.bucketId` *is* the
//      key; there is no second list kept in step with the first. It lives on the key side
//      of the storage split (persistence.ts) and never reaches the browser.
//   2. **A wrong bucket is a teachable moment.** Every ready item owes a default
//      explanation (`fb[itemId].def`, a blocker); a text per (item × wrong bucket) is
//      coverage the author fills in over time (`fb[itemId].ov[bucketId]`).
//
// Field names are camelCase (plan 34 §7). The author's focus (grammar / vocabulary) is
// *not* a field: decision Q1-A of plan 66 — the subject is derived from the atom graph or
// set in the shared axes card, never authored into the document.

/** The refusal bucket's fixed id — "none of these" (DECISIONS §3). */
export const SB_NONE = 'none';

/** Counts the refusal bucket. One constant, so a language pack can raise it knowingly. */
export const SB_MAX_BUCKETS = 5;

/** Under two buckets there is no classification. */
export const SB_MIN_BUCKETS = 2;

/** Fewer ready items than this is too short to show whether the rule is known. */
export const SB_MIN_READY_ITEMS = 4;

/** A bucket holding more than this share of the items invites dumping (DECISIONS §5). */
export const SB_SKEW_SHARE = 0.6;

/** …and the share is only meaningful from this many ready items on. */
export const SB_SKEW_MIN_ITEMS = 6;

/** Under this many items per bucket the exercise reads as a guessing game. */
export const SB_MIN_PER_BUCKET = 2;

/** More than this share of items accepting several buckets: nothing can be wrong. */
export const SB_MULTI_HEAVY_SHARE = 0.5;

/** Tiles read as a word or a short phrase. */
export const SB_LONG_ITEM_WORDS = 6;

export interface Bucket {
  /** Stable, generated at creation — never a positional index. */
  id: string;
  /** What the student reads on the zone: «en», «ei», «et». */
  label: string;
  /** The principle. Its first clause is the in-task hint; the whole is shown with the key. */
  rule: string;
}

export interface SortItem {
  /** Stable — reordering the list must not reshuffle explanations (plan 54). Also the `itemKey`. */
  id: string;
  /** One word or a short phrase. */
  text: string;
  /** The primary bucket: the answer shown on reveal. `null` until the author assigns it. */
  bucketId: string | null;
  /** Buckets accepted in addition to the primary — `ei bok` and `en bok` (DECISIONS §1). */
  also: string[];
  /** Why it belongs where it does — shown with the key. */
  why: string;
  /** The item's own recording, under the audio layer's `source: 'items'` (plan 56). */
  mediaId?: string;
  /** The item's slice of the exercise clip — owned by the audio layer, carried as is. */
  audio?: unknown;
}

/** Why a wrong bucket is wrong: one default, and optional texts per wrong bucket. */
export interface ItemFeedback {
  def: string;
  ov: Record<string, string>;
}

/** Checks of the board. `0` means unlimited. */
export type Attempts = 0 | 1 | 2 | 3;

export const ATTEMPTS: readonly Attempts[] = [0, 1, 2, 3];

/** Exercise-wide delivery settings — step 4. None of them touches the content. */
export interface Settings {
  /** Item order per attempt. Applied server-side; the order carries no information. */
  shuffle: boolean;
  /** «N igjen» in the pool. Off by default: it turns the tail into arithmetic (DECISIONS §4). */
  showRemaining: boolean;
  /** The first clause of each bucket's rule under its label. */
  hints: boolean;
  /** Whether the answers may be shown — on reveal and once the board closes. */
  revealKey: boolean;
  attempts: Attempts;
  /** Pass mark, percent of items, compared with `>=`. */
  threshold: number;
}

export const DEFAULT_SETTINGS: Settings = {
  shuffle: true,
  showRemaining: false,
  hints: true,
  revealKey: true,
  attempts: 0,
  threshold: 70,
};

/** The whole document, as the builder edits it. */
export interface SortIntoBucketsContent {
  title: string;
  /** In the course's target language. */
  instruction: string;
  /** Authored buckets, in display order. The refusal bucket is not among them. */
  buckets: Bucket[];
  /** The refusal bucket, id `SB_NONE`. Counts toward `SB_MAX_BUCKETS`. */
  useNone: boolean;
  noneLabel: string;
  items: SortItem[];
  /** Keyed by item id, so reordering cannot move a text onto another item. */
  fb: Record<string, ItemFeedback>;
  settings: Settings;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newBucket(label = '', rule = ''): Bucket {
  return { id: newId(), label, rule };
}

export function newItem(text = '', bucketId: string | null = null): SortItem {
  return { id: newId(), text, bucketId, also: [], why: '' };
}

/**
 * A blank document: two empty buckets and three empty items (AC-B1).
 *
 * The prototype seeds a Norwegian instruction and «Ingen av delene»; that would reach a
 * Ukrainian school (AC-X7, plan 53 §3.6). The instruction stays empty, and the refusal
 * label comes from the course language's pack — empty where there is none.
 */
export function emptyContent(noneLabel = ''): SortIntoBucketsContent {
  return {
    title: '',
    instruction: '',
    buckets: [newBucket(), newBucket()],
    useNone: false,
    noneLabel,
    items: [newItem(), newItem(), newItem()],
    fb: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** How many checks the board allows, or `null` for unlimited. */
export function maxChecks(settings: Settings): number | null {
  return settings.attempts === 0 ? null : settings.attempts;
}

/** The pass mark in items rather than percent — what step 4 tells the author (AC-D2). */
export function passMark(settings: Settings, totalItems: number): number {
  if (totalItems <= 0) return 0;
  return Math.ceil((settings.threshold / 100) * totalItems);
}
