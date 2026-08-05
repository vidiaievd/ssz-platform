// The validation engine for `word_bank_gap_fill` — BEHAVIOR.md §1.6, "one engine, three
// surfaces": the builder's rail dots, its field errors, and the pre-assign gate all read
// this list, and so does the server on save (plan step 2.3). One function, so that
// AC-X1 — client and server return the same codes for the same document — holds by
// construction rather than by review.
//
// Issues carry a code and the parameters its message needs, never the message itself.
// The teacher UI is localised into four languages (en · nb · uk · ru), so English prose
// in shared logic could not be rendered; SPEC_api_contract already sends codes over the
// wire for exactly this reason. The renderer owns the words.

import type { GapKey, WordBankGapFill } from './model.js';
import { answers, bank, coverage, equals, feedbackFor, gaps, tokens } from './selectors.js';

export type IssueLevel = 'blocker' | 'warning';

/** Which builder step owns the fix. Rail dots and the gate's deep links both use it. */
export type IssueStep = 1 | 2 | 3;

export type Issue =
  | { code: 'EX_NO_TITLE'; level: 'blocker'; step: 1 }
  | { code: 'EX_NO_SENTENCES'; level: 'blocker'; step: 1 }
  | { code: 'SENT_EMPTY'; level: 'blocker'; step: 1; sentenceId: string; sentenceIndex: number }
  | { code: 'SENT_NO_GAP'; level: 'blocker'; step: 1; sentenceId: string; sentenceIndex: number }
  | { code: 'BANK_DUPLICATE'; level: 'blocker'; step: 2; word: string }
  | { code: 'BANK_TOO_FEW'; level: 'blocker'; step: 2; bankSize: number }
  | { code: 'BANK_TOO_SMALL'; level: 'warning'; step: 2; bankSize: number; gapCount: number }
  | { code: 'FB_PAIRS_UNUSED'; level: 'warning'; step: 2; pairCount: number }
  | { code: 'FB_NO_FALLBACK'; level: 'blocker'; step: 3; gapKey: GapKey; label: string }
  | { code: 'FB_NO_WHY'; level: 'warning'; step: 3; gapKey: GapKey; label: string }
  | { code: 'FB_PARTIAL_COVERAGE'; level: 'warning'; step: 3; written: number; total: number };

export type IssueCode = Issue['code'];

/**
 * Every problem with the document, in authoring order: step 1, then 2, then 3, and
 * within a step in the order the teacher would meet them.
 *
 * The order is part of the contract, not a detail — AC-X1 compares the client's list
 * with the server's, and a set comparison would hide a real disagreement about which
 * sentence or which gap is at fault.
 *
 * Callers that need blockers first (the pre-assign gate, AC-B24) sort by level; callers
 * that need one step (the rail dots) filter by `step`.
 */
export function issues(ex: WordBankGapFill): Issue[] {
  const out: Issue[] = [];
  const allGaps = gaps(ex);
  const bankMode = ex.settings.input === 'bank';

  // ── Step 1 — sentences and gaps ──────────────────────────────────────────
  if (ex.title.trim() === '') out.push({ code: 'EX_NO_TITLE', level: 'blocker', step: 1 });
  if (ex.sentences.length === 0) {
    out.push({ code: 'EX_NO_SENTENCES', level: 'blocker', step: 1 });
  }

  ex.sentences.forEach((sentence, sentenceIndex) => {
    const context = { sentenceId: sentence.id, sentenceIndex };
    // An empty sentence has no gap either; reporting both would be noise on one card.
    if (tokens(sentence.text).length === 0) {
      out.push({ code: 'SENT_EMPTY', level: 'blocker', step: 1, ...context });
    } else if (!allGaps.some((gap) => gap.sentenceId === sentence.id)) {
      out.push({ code: 'SENT_NO_GAP', level: 'blocker', step: 1, ...context });
    }
  });

  // ── Step 2 — the word bank ───────────────────────────────────────────────
  if (bankMode) {
    const correct = answers(ex);
    const bankWords = bank(ex);

    // `bank()` drops a distractor that is really an answer so the student never sees a
    // word twice. Reporting it here is what stops that from being a chip that silently
    // fails to appear.
    for (const raw of ex.distractors) {
      const word = raw.trim();
      if (word === '') continue;
      if (correct.some((answer) => equals(answer, word, ex.settings.caseSensitive))) {
        out.push({ code: 'BANK_DUPLICATE', level: 'blocker', step: 2, word });
      }
    }

    if (allGaps.length > 0 && bankWords.length < 2) {
      // Fewer than two words is not a choice, so it is not an exercise: whatever is in
      // the bank goes in the gap. Distinct from BANK_TOO_SMALL below, which is about a
      // bank that is a real choice but a thin one.
      out.push({ code: 'BANK_TOO_FEW', level: 'blocker', step: 2, bankSize: bankWords.length });
    } else if (
      allGaps.length > 0 &&
      !ex.settings.allowReuse &&
      bankWords.length < allGaps.length + 2
    ) {
      // AC-B14. Skipped when words may be reused: elimination is only an exploit when
      // each word is spent once, which is what makes the last gaps free.
      out.push({
        code: 'BANK_TOO_SMALL',
        level: 'warning',
        step: 2,
        bankSize: bankWords.length,
        gapCount: allGaps.length,
      });
    }
  } else {
    // Free mode keeps the pair matrix rather than deleting it, so the teacher can switch
    // back (plan step 4.2). What it cannot do is show it: nobody chose a wrong word.
    const pairCount = allGaps.reduce(
      (sum, gap) => sum + Object.keys(feedbackFor(ex, gap.key).pairs).length,
      0,
    );
    if (pairCount > 0) {
      out.push({ code: 'FB_PAIRS_UNUSED', level: 'warning', step: 2, pairCount });
    }
  }

  // ── Step 3 — explanations ────────────────────────────────────────────────
  for (const gap of allGaps) {
    const gapFeedback = feedbackFor(ex, gap.key);
    if (gapFeedback.fallback.trim() === '') {
      out.push({
        code: 'FB_NO_FALLBACK',
        level: 'blocker',
        step: 3,
        gapKey: gap.key,
        label: gap.label,
      });
    }
  }

  for (const gap of allGaps) {
    if (feedbackFor(ex, gap.key).why.trim() === '') {
      out.push({ code: 'FB_NO_WHY', level: 'warning', step: 3, gapKey: gap.key, label: gap.label });
    }
  }

  const { written, total } = coverage(ex);
  if (total > 0 && written < total) {
    out.push({ code: 'FB_PARTIAL_COVERAGE', level: 'warning', step: 3, written, total });
  }

  return out;
}

/**
 * Whether the exercise may be assigned. False exactly when a blocker exists.
 *
 * Readiness is not a stored field (plan decision 5): the platform already has container
 * versioning and pre-flight, and a second readiness model would contend with it. This is
 * a question you ask the document, not a flag you set on it.
 */
export function isReady(ex: WordBankGapFill): boolean {
  return !issues(ex).some((issue) => issue.level === 'blocker');
}

export function blockers(ex: WordBankGapFill): Issue[] {
  return issues(ex).filter((issue) => issue.level === 'blocker');
}

export function warnings(ex: WordBankGapFill): Issue[] {
  return issues(ex).filter((issue) => issue.level === 'warning');
}
