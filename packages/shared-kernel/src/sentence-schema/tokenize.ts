// Turning a sentence into chunks, and keeping the author's placements while they edit it.
//
// Source: `ssTokenize` / `ssRetokenize` and the join/split buttons of the handoff's
// chunk strip (data.jsx, steps.jsx).
//
// There is no tokenizer here beyond whitespace, and that is deliberate (README, "Open /
// deferred"): no POS tagging, no parser. The teacher declares the key by hand because the
// key is also the teaching claim — a machine guess would quietly become the claim instead.

import { newChunk, type Chunk } from './model.js';

/** Words of a sentence, whitespace-separated, empties dropped. */
export function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Recompute the chunks of a row after its text changed, carrying placements over.
 *
 * This runs on every keystroke, and the rule it implements is the difference between a
 * usable builder and an infuriating one: a teacher fixes a typo after placing eight
 * chunks, and none of that work may be lost (IMPLEMENTATION.md, "Re-tokenizing must
 * preserve work").
 *
 * Matching is by text, first match wins, and each old placement is consumed once — so a
 * sentence with two `ikke` hands one placement to each, not the same one twice. Only
 * chunks that *were* placed are eligible to carry anything: an unplaced chunk has nothing
 * to preserve, and treating it as a candidate would let it shadow a placed twin.
 *
 * Multi-word chunks survive whole. A joined `"I morgen"` matches the token run
 * `["I", "morgen"]` and is re-emitted as one chunk with its field and alts intact —
 * without that, joining a chunk and then fixing a comma elsewhere would silently split it
 * back apart.
 */
export function retokenize(text: string, previous: Chunk[]): Chunk[] {
  const words = tokenize(text);
  // Only placed chunks carry anything, longest first: a joined "I morgen" must claim its
  // two words before a bare "I" can claim the first of them.
  const pool = previous
    .filter((c) => c.field !== null)
    .map((c) => ({ chunk: c, words: tokenize(c.text), used: false }))
    .sort((a, b) => b.words.length - a.words.length);

  const out: Chunk[] = [];
  let at = 0;
  while (at < words.length) {
    const candidate = pool.find(
      (p) => !p.used && p.words.length > 0 && p.words.every((w, i) => words[at + i] === w),
    );
    if (candidate) {
      candidate.used = true;
      // A new id would orphan `row.fb[chunkId]`; the chunk is the same chunk.
      out.push({ ...candidate.chunk, text: candidate.words.join(' ') });
      at += candidate.words.length;
    } else {
      out.push(newChunk(words[at]!));
      at += 1;
    }
  }
  return out;
}

/**
 * Join the chunk at `index` with the one after it.
 *
 * The left chunk survives — id, field and alts — because that is what the author was
 * looking at when they pressed `+`. This is how "one element" in the V2 sense gets
 * expressed: the Forfelt holds one constituent, and `I morgen` is one constituent.
 */
export function join(chunks: Chunk[], index: number): Chunk[] {
  const left = chunks[index];
  const right = chunks[index + 1];
  if (!left || !right) return chunks;
  const merged: Chunk = { ...left, text: `${left.text} ${right.text}` };
  return [...chunks.slice(0, index), merged, ...chunks.slice(index + 2)];
}

/**
 * Split a multi-word chunk back into its words.
 *
 * Each word inherits the field — the author's claim about where this material belongs
 * survives — but not the alts: an alternative field was asserted about the constituent as
 * a whole ("«I morgen» may also be correct in Adverbial"), and it says nothing about `I`
 * on its own.
 */
export function split(chunks: Chunk[], index: number): Chunk[] {
  const target = chunks[index];
  if (!target) return chunks;
  const words = tokenize(target.text);
  if (words.length < 2) return chunks;
  const parts: Chunk[] = words.map((w, i) => ({
    // The first part keeps the id so `row.fb` and any selection survive the split.
    ...(i === 0 ? target : newChunk(w)),
    text: w,
    field: target.field,
    alt: [],
  }));
  return [...chunks.slice(0, index), ...parts, ...chunks.slice(index + 1)];
}

/** Text of the row as its chunks currently read — what `row.text` is kept equal to. */
export function chunksToText(chunks: Chunk[]): string {
  return chunks.map((c) => c.text).join(' ');
}
