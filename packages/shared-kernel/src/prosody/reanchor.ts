// Re-anchoring a stored layer after the text changed — the two passes of
// `highlight-in-text/reanchor.ts` (plan 67, Q7-A), on token anchors instead of char spans:
//
//   1. **Shift.** Old and new text share a prefix and a suffix; a mark wholly inside either
//      moves with it, if its words are still on token edges at the new place. This keeps a
//      mark on «its» occurrence when another occurrence is inserted before it.
//   2. **Words and ordinal**, for a mark the edit touched: which run of its words it was in
//      the old text, landed on the same-numbered run in the new one (or the last). No run →
//      an orphan, kept for the author.
//
// Matching is lower-cased; the snapshot takes the new spelling. Two marks of one kind landing
// on one token keep the first, the other becomes an orphan. Run once, when an edit is applied.
// Lexicon stresses are recomputed per text — only the authored layer needs this.

import type { Token } from '../text/words.js';
import { tokenize } from '../text/words.js';
import type { ProsodyElement, ProsodyLayer } from './model.js';
import { anchorLength, anchorWords, elementsOf, layerOf } from './model.js';

export function reanchorProsody(
  oldText: string,
  newText: string,
  layer: ProsodyLayer,
): ProsodyLayer {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const edit = editRegion(oldText, newText);
  const landed: ProsodyElement[] = [];
  const orphans = [...layer.orphans];
  const taken = new Set<string>();

  for (const el of elementsOf(layer)) {
    const words = anchorWords(el.mark);
    const n = anchorLength(el.kind);
    const at =
      words.length === n
        ? (shifted(edit, oldTokens, newTokens, el.mark.i, words) ??
          land(oldTokens, newTokens, el.mark.i, words))
        : null;
    const key = `${el.kind}:${at}`;
    if (at === null || taken.has(key)) {
      orphans.push(el);
      continue;
    }
    taken.add(key);
    const w = newTokens
      .slice(at, at + n)
      .map((t) => t.w)
      .join(' ');
    landed.push({ ...el, mark: { ...el.mark, i: at, w } } as ProsodyElement);
  }

  return layerOf(landed, orphans);
}

// ── internals ───────────────────────────────────────────────────────────────

interface EditRegion {
  from: number;
  oldTo: number;
  delta: number;
}

function editRegion(oldText: string, newText: string): EditRegion {
  let from = 0;
  const max = Math.min(oldText.length, newText.length);
  while (from < max && oldText[from] === newText[from]) from++;
  let suffix = 0;
  while (
    suffix < max - from &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }
  return { from, oldTo: oldText.length - suffix, delta: newText.length - oldText.length };
}

const wordsAt = (tokens: readonly Token[], i: number, n: number) =>
  tokens.slice(i, i + n).map((t) => t.w.toLowerCase());

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, k) => x === b[k]);

/** Pass 1 — the mark outside the edit, moved with it, if its words are still there. */
function shifted(
  edit: EditRegion,
  oldTokens: readonly Token[],
  newTokens: readonly Token[],
  i: number,
  words: readonly string[],
): number | null {
  const first = oldTokens[i];
  const last = oldTokens[i + words.length - 1];
  if (!first || !last || !same(wordsAt(oldTokens, i, words.length), words)) return null;

  let start: number;
  if (last.e <= edit.from) start = first.s;
  else if (first.s >= edit.oldTo) start = first.s + edit.delta;
  else return null;

  const hit = newTokens.find((t) => t.s === start);
  return hit && same(wordsAt(newTokens, hit.i, words.length), words) ? hit.i : null;
}

/** Pass 2 — the same-numbered run of the mark's words in the new text. */
function land(
  oldTokens: readonly Token[],
  newTokens: readonly Token[],
  i: number,
  words: readonly string[],
): number | null {
  const ordinal = Math.max(0, runsOf(oldTokens, words).indexOf(i));
  const runs = runsOf(newTokens, words);
  if (runs.length === 0) return null;
  return runs[Math.min(ordinal, runs.length - 1)] ?? null;
}

function runsOf(tokens: readonly Token[], words: readonly string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (same(wordsAt(tokens, i, words.length), words)) out.push(i);
  }
  return out;
}
