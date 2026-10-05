import { fromPersisted as gapFillFromPersisted, gaps } from '../wordbank-gapfill/index.js';
import { fromPersisted as matchPairsFromPersisted } from '../match-pairs/index.js';
import { fromPersisted as sortFromPersisted } from '../sort-into-buckets/index.js';
import { fromPersisted as highlightFromPersisted } from '../highlight-in-text/index.js';
import { fromPersisted as dictationFromPersisted, readySegments, tokens } from '../dictation/index.js';
import {
  bare,
  derivedTargets as inflectionTargets,
  fromPersisted as inflectionFromPersisted,
  gradedCells,
  packOf,
} from '../inflection-table/index.js';
import type { DerivedTarget, ExerciseItem, ExerciseItems } from './model.js';

// A stand-in envelope for the fields no reader here cares about. The kernel's `fromPersisted`
// wants a whole document; what is being read is the body of it.
const ENVELOPE = { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' };

/**
 * Templates whose documents have addressable pieces.
 *
 * Deliberately short. These are the templates whose per-item verdicts travel in
 * `gapResults` (or, for `match_pairs`, are meant to), so a target on one of their pieces can
 * be joined to evidence about it. `sort_into_buckets` joined with plan 66: its verdict is per
 * item by design, and the engine sends it (decision Q3-A). `highlight_in_text` joined with
 * plan 67: its verdict is per question, sent the same way. `dictation` joined with plan 68:
 * its verdict is per sentence. `inflection_table` joined with plan 69: its verdict is per cell. A
 * template that grades as a whole gains nothing from per-piece targets — the evidence would
 * all carry the same verdict anyway — so it addresses the exercise and no more.
 *
 * When a template starts publishing per-item verdicts, it is added here and to `itemsOf`.
 */
export const ADDRESSABLE_TEMPLATES: readonly string[] = [
  'word_bank_gap_fill',
  'match_pairs',
  'sort_into_buckets',
  'highlight_in_text',
  'dictation',
  'inflection_table',
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
    case 'highlight_in_text':
      return highlightItems(content, expectedAnswers);
    case 'dictation':
      return dictationItems(content, expectedAnswers);
    case 'inflection_table':
      return inflectionItems(content, expectedAnswers);
    default:
      return null;
  }
}

/**
 * The addresses a document makes on its own, beside the author's rows (plan 69, Q1-B).
 *
 * Empty for every template but `inflection_table`, and for a malformed document — the same
 * leniency as `itemsOf`. Every key returned is one `itemsOf` returns for the same document.
 */
export function derivedTargetsOf(
  templateCode: string,
  content: unknown,
  expectedAnswers: unknown,
): DerivedTarget[] {
  if (templateCode !== 'inflection_table') return [];
  try {
    return inflectionTargets(inflectionFromPersisted(content, expectedAnswers));
  } catch {
    return [];
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

/**
 * The question id — the key every per-question verdict of `highlight_in_text` carries
 * (plan 67, SPEC_data_model §7).
 *
 * Every question with a prompt, in document order. The passage and the individual spans are
 * not targets: a question is what is scored, retried and reported. What a suggester matches
 * is the words the key marks — `fortalte`, `i førti år` — not the prompt, which is about the
 * feature and names no word.
 */
function highlightItems(content: unknown, expectedAnswers: unknown): ExerciseItem[] {
  try {
    const document = highlightFromPersisted(content, expectedAnswers);
    return document.questions
      .filter((q) => q.prompt.trim() !== '')
      .map((q, index) => {
        const words = [...q.spans]
          .sort((a, b) => a.start - b.start)
          // Stored spans start and end on token edges, so the slice is the marked words.
          .map((s) => document.text.slice(s.start, s.end).trim())
          .filter((w) => w !== '');
        return {
          key: q.id,
          label: `Q${index + 1} — ${q.prompt.trim()}`,
          value: q.prompt.trim(),
          matchValues: [...new Set(words)],
        };
      });
  } catch {
    return [];
  }
}

/** How much of a sentence names it in the builder — enough to tell four apart. */
const DICTATION_LABEL_LENGTH = 40;

/**
 * The segment id — the key every per-sentence verdict of `dictation` carries (plan 68,
 * SPEC_data_model §7). `mode: 'whole'` still has exactly one segment, so it needs no case.
 *
 * Every segment with a sentence written, in document order — the same filter that decides
 * what a learner is given. A focus word is not a target: it is reported inside its sentence's
 * verdict, and an atom pinned to it could never be joined to evidence. What a suggester
 * matches is the sentence's words, the focus words first — those are the ones the author
 * already said the sentence is about.
 */
function dictationItems(content: unknown, expectedAnswers: unknown): ExerciseItem[] {
  try {
    const document = dictationFromPersisted(content, expectedAnswers);
    return readySegments(document).map((segment, index) => {
      const words = tokens(segment.text);
      const focused = [...segment.focus]
        .sort((a, b) => a.wordIndex - b.wordIndex)
        .map((f) => words[f.wordIndex]?.w)
        .filter((w): w is string => w !== undefined);
      const sentence = segment.text.trim().replace(/\s+/g, ' ');
      return {
        key: segment.id,
        label: `S${index + 1} — ${clip(sentence, DICTATION_LABEL_LENGTH)}`,
        value: sentence,
        matchValues: [...new Set([...focused, ...words.map((t) => t.w)])],
      };
    });
  } catch {
    return [];
  }
}

/**
 * The cell key `rowId:slotId` — the key every per-cell verdict of `inflection_table` carries
 * (plan 69 §3.9).
 *
 * Exactly the cells a learner is graded on: asked, in a slot in play, in a row with a lemma, with
 * a key. A given cell is part of the task, not of the answer, and a row is not a target — its
 * verdict is reported beside the cells, never instead of them. Labelled `bok · best. ent. — boka`:
 * the word, the column and the form tell the author which cell it is. What a suggester matches is
 * the form first, then the lemma — `boka` and `bok` both find the dictionary's `bok`.
 */
function inflectionItems(content: unknown, expectedAnswers: unknown): ExerciseItem[] {
  try {
    const document = inflectionFromPersisted(content, expectedAnswers);
    const pack = packOf(document);
    return gradedCells(document).map((c) => {
      const lemma = pack ? bare(c.row.lemma, pack) : c.row.lemma.trim();
      const form = c.cell.value.trim();
      return {
        key: c.key,
        label: `${lemma} · ${c.slot.short} — ${form}`,
        value: form,
        matchValues: [...new Set([form, lemma])],
      };
    });
  } catch {
    return [];
  }
}

/** Cut at the last word boundary within `max` characters. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}…`;
}
