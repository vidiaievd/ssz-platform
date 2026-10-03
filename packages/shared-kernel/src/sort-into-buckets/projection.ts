// What a student is allowed to see before answering — SPEC_api_contract §Student delivery.
//
// Items (id, text, recording) and buckets (id, label, and a hint when hints are on). No
// `bucketId`, no `also`, no `why`, no `fb` — ever (AC-S11). Three responsibilities beyond
// omission:
//
//   1. **Unready items never reach the student.** An item without text or without a live
//      bucket is dropped here, not in the runner.
//   2. **The order is dealt here**, with a shuffle the server seeds per attempt — a runner
//      that shuffled locally would shuffle what the network tab had already shown in order.
//   3. **The hint is resolved here**: the first clause of the rule, and only under
//      `settings.hints`. The rule itself waits for the key (grading.ts).
//
// Item ids are the authored ids, not per-attempt opaque ones (plan 66 §5, deviation 2): the
// key lives in the other column, an id is random and encodes nothing.

import { firstClause, readyItems } from './derive.js';
import type { Attempts, SortIntoBucketsContent } from './model.js';
import { SB_NONE } from './model.js';
import { readContent } from './persistence.js';
import { identityShuffle } from './shuffle.js';

export interface ProjectedBucket {
  id: string;
  label: string;
  /** The first clause of the rule. Present only under `settings.hints` and when non-empty. */
  hint?: string;
}

export interface ProjectedItem {
  id: string;
  text: string;
  /** The item's own recording, under the audio layer's `source: 'items'`. */
  mediaId?: string;
}

/**
 * The settings that change what the runner may draw or offer.
 *
 * `shuffle` is applied, not shipped. `revealKey` is shipped although it decides how much of
 * the key the server sends: the runner must know before the first check whether
 * «Vis riktig plassering» exists, and knowing that a key *can* be shown is not the key.
 */
export interface ProjectedSettings {
  showRemaining: boolean;
  revealKey: boolean;
  attempts: Attempts;
  threshold: number;
}

export interface StudentProjection {
  instruction: string;
  buckets: ProjectedBucket[];
  items: ProjectedItem[];
  settings: ProjectedSettings;
}

/** Deterministic when nothing is injected; the server supplies the per-attempt seed. */
export type Shuffle = <T>(items: readonly T[]) => T[];

/**
 * Project the document for one student.
 *
 * Takes both columns because only the key side can say whether an item is ready — its
 * bucket lives in `expected_answers`. It asks that column one question per item, "is there a
 * live bucket", and carries nothing else from it into the result; a caller passing `{}`
 * gets an empty pool rather than a leak.
 */
export function toStudentProjection(
  content: unknown,
  expectedAnswers: unknown,
  shuffle: Shuffle = identityShuffle,
): StudentProjection {
  const ex = fromColumns(content, expectedAnswers);
  const s = ex.settings;

  const shownBuckets: ProjectedBucket[] = ex.buckets.map((b) => withHint(b.id, b.label, b.rule, s.hints));
  if (ex.useNone) shownBuckets.push({ id: SB_NONE, label: ex.noneLabel });

  const ready = readyItems(ex).map(
    (i): ProjectedItem => ({
      id: i.id,
      text: i.text,
      ...(i.mediaId !== undefined ? { mediaId: i.mediaId } : {}),
    }),
  );

  return {
    instruction: ex.instruction,
    buckets: shownBuckets,
    items: s.shuffle ? shuffle(ready) : ready,
    settings: {
      showRemaining: s.showRemaining,
      revealKey: s.revealKey,
      attempts: s.attempts,
      threshold: s.threshold,
    },
  };
}

function withHint(id: string, label: string, rule: string, hints: boolean): ProjectedBucket {
  const hint = hints ? firstClause(rule) : '';
  return hint === '' ? { id, label } : { id, label, hint };
}

/**
 * Just enough of the document to know which items are ready.
 *
 * Not `fromPersisted`: that returns the authored document, keys and all, and handing it to a
 * projection would put the thing withheld one property access from the thing returned. Each
 * item gets a placeholder bucket — the first live one — exactly when its real bucket is
 * live, which is all `readyItems` asks.
 */
function fromColumns(content: unknown, expectedAnswers: unknown): SortIntoBucketsContent {
  const persisted = readContent(content);
  const live = new Set(persisted.buckets.map((b) => b.id));
  if (persisted.useNone) live.add(SB_NONE);
  const placeholder = [...live][0] ?? null;
  const assigned = readAssignedIds(expectedAnswers, live);

  return {
    title: persisted.title,
    instruction: persisted.instruction,
    buckets: persisted.buckets,
    useNone: persisted.useNone,
    noneLabel: persisted.noneLabel,
    fb: {},
    settings: persisted.settings,
    items: persisted.items.map((i) => ({
      id: i.id,
      text: i.text,
      bucketId: assigned.has(i.id) ? placeholder : null,
      also: [],
      why: '',
      ...(i.mediaId !== undefined ? { mediaId: i.mediaId } : {}),
    })),
  };
}

function readAssignedIds(expectedAnswers: unknown, live: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const record = expectedAnswers as { items?: Record<string, { bucketId?: unknown }> } | null;
  const items = typeof record === 'object' && record !== null ? record.items : undefined;
  if (typeof items !== 'object' || items === null) return out;

  for (const [id, key] of Object.entries(items)) {
    const bucketId = (key as { bucketId?: unknown } | null)?.bucketId;
    if (typeof bucketId === 'string' && live.has(bucketId)) out.add(id);
  }
  return out;
}
