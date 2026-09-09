// The student projection: what may leave the server before a check.
//
// For most exercise templates `content` is safe to serve as it stands — the answers live
// in a separate column. This one stores each pair whole, so the answer to "which half
// completes this sentence" is the neighbouring field, and serving the content raw would
// ship every answer to the browser the moment the exercise opens.
//
// BEHAVIOR §2.4: "the pool must not disclose which halves are answers". This function is
// the cut. Two properties it must keep, both asserted in the tests:
//
//   1. No slot and no pool item ever share an identifier (AC-S15). Slots are keyed by
//      `PairId`, pool items by `RightId`, and the two are minted independently — see the
//      note on `RightId` in model.ts.
//   2. Answers and distractors are indistinguishable: same shape, no flag, no ordering
//      that mirrors the slots.

import type { MatchTask, PairId, RightId, Variant } from './model.js';
import { completePairs, rightItems } from './selectors.js';

/** One left half, awaiting a right one. */
export interface ProjectedSlot {
  /** The client posts placements against this. Never equal to any `itemId`. */
  slotId: PairId;
  left: string;
}

/** One item of the pool. Nothing distinguishes an answer from a distractor. */
export interface ProjectedItem {
  itemId: RightId;
  text: string;
}

export interface StudentProjection {
  variant: Variant;
  slots: ProjectedSlot[];
  pool: ProjectedItem[];
  /** Only the settings that change what the student sees. `shuffle` is applied, not shipped. */
  settings: {
    showRemaining: boolean;
  };
}

export interface ProjectionOptions {
  /**
   * Applied to the pool when `settings.shuffle` is on. Injected rather than done here so
   * that this module stays pure: the same document must always project the same way, or
   * it cannot be tested and the client and the server cannot be compared.
   *
   * The server passes a CSPRNG-backed Fisher–Yates. The builder's preview passes the
   * kernel's seeded `shuffled`, so that typing does not reorder the pool under the
   * teacher's hands.
   */
  shuffle?: (pool: ProjectedItem[]) => ProjectedItem[];
}

export function toStudentProjection(
  task: MatchTask,
  options: ProjectionOptions = {},
): StudentProjection {
  const slots: ProjectedSlot[] = completePairs(task).map((pair) => ({
    slotId: pair.id,
    left: pair.left,
  }));

  // `rightItems` carries `kind` and `n` — which one is an answer, and which pair owns it.
  // Both are dropped here, deliberately and by construction rather than by omission: the
  // projection names the two fields it keeps instead of spreading the item.
  const pool: ProjectedItem[] = rightItems(task).map((item) => ({
    itemId: item.id,
    text: item.text,
  }));

  return {
    variant: task.variant,
    slots,
    // An unshuffled pool is the author's order, which lists every answer first and in
    // slot order. When `shuffle` is off the teacher asked for that; when it is on and no
    // shuffler was supplied, the caller forgot, and the honest response is the order as
    // written rather than a silent pretence of randomness.
    pool: task.settings.shuffle && options.shuffle !== undefined ? options.shuffle(pool) : pool,
    settings: { showRemaining: task.settings.showRemaining },
  };
}
