// Editing a sentence that already has focus words — SPEC_data_model §5, AC-B7.
//
// `wordIndex` is an index, so an edit can move it. On apply:
//
//   1. **Shift first** (plan 67, decision Q7-A — the same finding applies here). The words
//      before and after the edited stretch are the common prefix and suffix of the old and
//      new token lists; a focus word inside either keeps its word and moves by the change in
//      length. SPEC §5 alone — surface plus ordinal — would hand a focus word to the wrong
//      occurrence whenever the same word is inserted in front of it.
//   2. A focus word inside the edited stretch is looked for by its **surface at the same
//      ordinal occurrence** (case-insensitive), and re-anchored when found.
//   3. Not found → it becomes an **orphan**, carrying its surface and its reason, reported in
//      step 3 so the author can put it back or drop it. Nothing disappears silently — the
//      `item_missing` trap of plan 63.

import type { FocusOrphan, FocusWord, Segment } from './model.js';
import { tokens } from './tokens.js';

export interface ReanchorResult {
  focus: FocusWord[];
  orphans: FocusOrphan[];
}

const lower = (text: string): string[] => tokens(text).map((t) => t.w.toLowerCase());

export function reanchorFocus(seg: Segment, newText: string): ReanchorResult {
  const before = lower(seg.text);
  const after = lower(newText);

  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  const delta = after.length - before.length;

  const focus: FocusWord[] = [];
  const orphans: FocusOrphan[] = [];
  const taken = new Set<number>();

  const place = (f: FocusWord, wordIndex: number | null): void => {
    if (wordIndex === null || taken.has(wordIndex)) {
      orphans.push({
        id: f.id,
        segmentId: seg.id,
        surface: tokens(seg.text)[f.wordIndex]?.w ?? '',
        why: f.why,
      });
      return;
    }
    taken.add(wordIndex);
    focus.push({ ...f, wordIndex });
  };

  for (const f of seg.focus) {
    if (f.wordIndex < prefix) place(f, f.wordIndex);
    else if (f.wordIndex >= before.length - suffix) place(f, f.wordIndex + delta);
    else place(f, byOrdinal(before, after, f.wordIndex));
  }

  focus.sort((a, b) => a.wordIndex - b.wordIndex);
  return { focus, orphans };
}

/** The same word at the same occurrence in the new text, or `null`. */
function byOrdinal(
  before: readonly string[],
  after: readonly string[],
  wordIndex: number,
): number | null {
  const surface = before[wordIndex];
  if (surface === undefined) return null;
  const ordinal = before.slice(0, wordIndex).filter((w) => w === surface).length;
  let seen = 0;
  for (let k = 0; k < after.length; k++) {
    if (after[k] !== surface) continue;
    if (seen === ordinal) return k;
    seen++;
  }
  return null;
}

/** How many focus words an edit would orphan — shown before it is applied. */
export function previewReanchor(seg: Segment, newText: string): number {
  return reanchorFocus(seg, newText).orphans.length;
}

/**
 * Where an orphan would land if put back: the first occurrence of its surface in its
 * sentence that is not already a focus word. `null` — the word is gone.
 */
export function putBackIndex(seg: Segment, orphan: FocusOrphan): number | null {
  const surface = orphan.surface.toLowerCase();
  if (surface === '') return null;
  const used = new Set(seg.focus.map((f) => f.wordIndex));
  const k = lower(seg.text).findIndex((w, i) => w === surface && !used.has(i));
  return k === -1 ? null : k;
}
