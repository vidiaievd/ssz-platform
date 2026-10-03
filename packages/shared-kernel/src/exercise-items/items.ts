import { fromPersisted as gapFillFromPersisted, gaps } from '../wordbank-gapfill/index.js';
import { fromPersisted as matchPairsFromPersisted } from '../match-pairs/index.js';
import { fromPersisted as sortFromPersisted } from '../sort-into-buckets/index.js';
import type { ExerciseItem, ExerciseItems } from './model.js';

// A stand-in envelope for the fields no reader here cares about. The kernel's `fromPersisted`
// wants a whole document; what is being read is the body of it.
const ENVELOPE = { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' };

/**
 * Templates whose documents have addressable pieces.
 *
 * Deliberately short. These are the templates whose per-item verdicts travel in
 * `gapResults` (or, for `match_pairs`, are meant to), so a target on one of their pieces can
 * be joined to evidence about it. `sort_into_buckets` joined with plan 66: its verdict is per
 * item by design, and the engine sends it (decision Q3-A). A
 * template that grades as a whole gains nothing from per-piece targets — the evidence would
 * all carry the same verdict anyway — so it addresses the exercise and no more.
 *
 * When a template starts publishing per-item verdicts, it is added here and to `itemsOf`.
 */
export const ADDRESSABLE_TEMPLATES: readonly string[] = [
  'word_bank_gap_fill',
  'match_pairs',
  'sort_into_buckets',
];

export function isAddressableTemplate(templateCode: string): boolean {
  return ADDRESSABLE_TEMPLATES.includes(templateCode);
}

/**
 * What can be pointed at inside this exercise, in document order.
 *
 * A malformed or unreadable document yields an empty list rather than throwing: this is read
 * on an editing screen, where half-written documents are normal, and an author with a broken
 * gap-fill should be told there is nothing to address — not shown a stack trace.
 */
export function itemsOf(
  templateCode: string,
  content: unknown,
  expectedAnswers: unknown,
): ExerciseItems {
  switch (templateCode) {
    case 'word_bank_gap_fill':
      return gapFillItems(content, expectedAnswers);
    case 'match_pairs':
      return matchPairsItems(content, expectedAnswers);
    case 'sort_into_buckets':
      return sortItems(content, expectedAnswers);
    default:
      return null;
  }
}

/**
 * `sentenceId#tokenIndex`, exactly as `gapResults` spells it.
 *
 * Note what this implies and the caller must handle: the key holds a **token index**, so
 * editing a sentence moves it. A target written against a gap the author has since edited
 * away does not point at a missing gap — it may point at a different one. Which is why a
 * target is resolved against this list on every read rather than trusted.
 */
function gapFillItems(content: unknown, expectedAnswers: unknown): ExerciseItem[] {
  try {
    const document = gapFillFromPersisted(ENVELOPE, content, expectedAnswers);
    return gaps(document).map((gap) => ({
      key: gap.key,
      // `G1 — bor` reads better in a dropdown than `G1`: the author is choosing what a gap
      // is about, and the answer word is the thing that tells them which gap this is.
      label: gap.answer === '' ? gap.label : `${gap.label} — ${gap.answer}`,
      value: gap.answer,
      matchValues: [gap.answer],
    }));
  } catch {
    return [];
  }
}

/** The pair id, as `match_pairs` already reports it per pair. */
function matchPairsItems(content: unknown, expectedAnswers: unknown): ExerciseItem[] {
  try {
    const document = matchPairsFromPersisted(ENVELOPE, content, expectedAnswers);
    return document.pairs.map((pair, index) => ({
      key: pair.id,
      label: pair.left === '' ? `P${index + 1}` : `P${index + 1} — ${pair.left}`,
      value: pair.left,
      // Both halves: see `matchValues`. The seeded corpus puts the word on the right.
      matchValues: [pair.left, pair.right].filter((half) => half !== ''),
    }));
  } catch {
    return [];
  }
}

/**
 * The item id — the key every per-item verdict of `sort_into_buckets` carries (plan 66).
 *
 * Every written item, assigned or not, in document order: an author may address an item
 * before deciding its bucket. The buckets themselves are not targets — a bucket is a
 * property of the verdict, not an atom (SPEC_data_model §registry tables).
 */
function sortItems(content: unknown, expectedAnswers: unknown): ExerciseItem[] {
  try {
    const document = sortFromPersisted(content, expectedAnswers);
    return document.items
      .filter((item) => item.text.trim() !== '')
      .map((item, index) => ({
        key: item.id,
        label: `I${index + 1} — ${item.text.trim()}`,
        value: item.text.trim(),
        matchValues: [item.text.trim()],
      }));
  } catch {
    return [];
  }
}
