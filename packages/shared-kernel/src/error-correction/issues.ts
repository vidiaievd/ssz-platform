// The authoring checks for `error_correction` — CHECK_ENGINE.md, "Forfattersjekker".
// One engine, three surfaces: the builder's rail dots, the finish gate, and the server
// on save. One function, so the three cannot disagree.
//
// Issues carry a code and the parameters their message needs, never the message itself:
// the teacher UI is localised into four languages, so English prose in shared logic
// could not be rendered. Same contract as `wordbank-gapfill/issues.ts`.

import { audioOf } from '../audio/model.js';
import type { ErrorCorrection, SpanKey } from './model.js';
import { align, authoredItems, coverage, hardSpans, spans, words } from './engine.js';

/**
 * `info` exists here and not in `wordbank-gapfill`: this template has settings that are
 * unusual rather than wrong (stray edits ignored, type shown without a count), and the
 * handoff asks for them to be surfaced without colouring a step's dot.
 */
export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's deep links both use it. */
export type IssueStep = 1 | 2 | 3 | 4;

type ItemContext = { itemId: string; itemIndex: number };

export type Issue =
  | { code: 'EX_NO_INSTRUCTION'; level: 'warning'; step: 1 }
  | { code: 'PASSAGE_MANY_ITEMS'; level: 'warning'; step: 1; itemCount: number }
  | { code: 'EX_NO_ITEMS'; level: 'blocker'; step: 2 }
  | ({ code: 'ITEM_NO_REF'; level: 'blocker'; step: 2 } & ItemContext)
  | ({ code: 'ITEM_IDENTICAL'; level: 'blocker'; step: 2 } & ItemContext)
  | ({ code: 'ITEM_ALL_SOFT'; level: 'blocker'; step: 2 } & ItemContext)
  | ({ code: 'ITEM_MANY_ERRORS'; level: 'warning'; step: 2; errorCount: number } & ItemContext)
  | ({ code: 'ITEM_TOO_LONG'; level: 'warning'; step: 2; wordCount: number } & ItemContext)
  | ({ code: 'SPAN_ORDER_TOO_WIDE'; level: 'warning'; step: 2; spanKey: SpanKey; width: number } & ItemContext)
  | ({ code: 'ITEM_ALT_EQUALS_WRONG'; level: 'warning'; step: 2; alt: string } & ItemContext)
  | ({ code: 'ITEM_COUNT_HIDDEN'; level: 'warning'; step: 3; errorCount: number } & ItemContext)
  | { code: 'CHECK_IGNORE_PUNCT'; level: 'warning'; step: 3 }
  | { code: 'CHECK_CASE_INSENSITIVE'; level: 'warning'; step: 3 }
  | { code: 'CHECK_STRAY_IGNORED'; level: 'info'; step: 3 }
  | { code: 'CHECK_NEAR_TOO_LOW'; level: 'warning'; step: 3; near: number }
  | { code: 'HINT_TYPE_WITHOUT_COUNT'; level: 'info'; step: 3 }
  | { code: 'AI_WITHOUT_CHECK'; level: 'info'; step: 4 }
  | { code: 'AI_UNLIMITED_BEFORE_SUBMIT'; level: 'warning'; step: 4 }
  | { code: 'REFS_AFTER_SUBMIT_WITH_RETRIES'; level: 'warning'; step: 4 };

export type IssueCode = Issue['code'];

/** Longer than this, a sentence stops being a find-the-mistake task and becomes reading. */
const LONG_SENTENCE_WORDS = 20;
/** More mistakes than this in one text is heavy at B1. */
const MANY_ERRORS = 4;
/** A word-order span wider than this leaves the student unable to see where it starts. */
const WIDE_ORDER_SPAN = 5;

/**
 * Every problem with the document, in authoring order: step 1, then 2, and so on.
 *
 * The order is part of the contract — the client and the server compare lists, and a set
 * comparison would hide a real disagreement about which item is at fault.
 */
export function issues(ex: ErrorCorrection): Issue[] {
  const out: Issue[] = [];
  const check = ex.check;

  // ── Step 1 — format ───────────────────────────────────────────────────────
  if (ex.instructions.trim() === '') {
    out.push({ code: 'EX_NO_INSTRUCTION', level: 'warning', step: 1 });
  }

  const written = authoredItems(ex);
  if (ex.mode === 'passage' && written.length > 1) {
    out.push({ code: 'PASSAGE_MANY_ITEMS', level: 'warning', step: 1, itemCount: written.length });
  }

  // ── Step 2 — the mistakes ─────────────────────────────────────────────────
  if (written.length === 0) out.push({ code: 'EX_NO_ITEMS', level: 'blocker', step: 2 });

  written.forEach((item, itemIndex) => {
    const context: ItemContext = { itemId: item.id, itemIndex };

    // Without an answer key nothing below can be derived — there are no mistakes to
    // report, only the missing key.
    if (item.ref.trim() === '') {
      out.push({ code: 'ITEM_NO_REF', level: 'blocker', step: 2, ...context });
      return;
    }

    const all = spans(item, check);
    const hard = hardSpans(item, check);

    if (all.length === 0) {
      out.push({ code: 'ITEM_IDENTICAL', level: 'blocker', step: 2, ...context });
    } else if (hard.length === 0) {
      out.push({ code: 'ITEM_ALL_SOFT', level: 'blocker', step: 2, ...context });
    }

    if (hard.length > MANY_ERRORS) {
      out.push({
        code: 'ITEM_MANY_ERRORS',
        level: 'warning',
        step: 2,
        errorCount: hard.length,
        ...context,
      });
    }

    const wordCount = words(item.wrong).length;
    if (ex.mode === 'sentences' && wordCount > LONG_SENTENCE_WORDS) {
      out.push({ code: 'ITEM_TOO_LONG', level: 'warning', step: 2, wordCount, ...context });
    }

    for (const span of hard) {
      const width = span.wTo - span.wFrom;
      if (span.type === 'order' && width > WIDE_ORDER_SPAN) {
        out.push({
          code: 'SPAN_ORDER_TOO_WIDE',
          level: 'warning',
          step: 2,
          spanKey: span.key,
          width,
          ...context,
        });
      }
    }

    for (const alt of item.alts ?? []) {
      if (alt.trim() === '') continue;
      const altWords = words(alt);
      if (altWords.length > 0 && align(words(item.wrong), altWords, check).edits === 0) {
        out.push({ code: 'ITEM_ALT_EQUALS_WRONG', level: 'warning', step: 2, alt, ...context });
      }
    }

    // ── Step 3, per item — several mistakes with the count hidden is guesswork ──
    if (hard.length > 1 && !ex.hints.count) {
      out.push({
        code: 'ITEM_COUNT_HIDDEN',
        level: 'warning',
        step: 3,
        errorCount: hard.length,
        ...context,
      });
    }
  });

  // ── Step 3 — hints and the check ──────────────────────────────────────────
  if (check.on && check.ignorePunct) {
    out.push({ code: 'CHECK_IGNORE_PUNCT', level: 'warning', step: 3 });
  }
  if (check.on && check.caseInsensitive) {
    out.push({ code: 'CHECK_CASE_INSENSITIVE', level: 'warning', step: 3 });
  }
  if (check.on && check.strayEdits === 'ignore' && coverage(ex).errors > 1) {
    out.push({ code: 'CHECK_STRAY_IGNORED', level: 'info', step: 3 });
  }
  if (check.on && check.near < 0.7) {
    out.push({ code: 'CHECK_NEAR_TOO_LOW', level: 'warning', step: 3, near: check.near });
  }
  if (ex.hints.showType && !ex.hints.count) {
    out.push({ code: 'HINT_TYPE_WITHOUT_COUNT', level: 'info', step: 3 });
  }

  // ── Step 4 — flow and AI ──────────────────────────────────────────────────
  if (!check.on && ex.ai.on) out.push({ code: 'AI_WITHOUT_CHECK', level: 'info', step: 4 });
  if (ex.ai.on && ex.ai.visibility === 'studentBefore' && ex.flow.selfCheck === 0) {
    out.push({ code: 'AI_UNLIMITED_BEFORE_SUBMIT', level: 'warning', step: 4 });
  }
  if (ex.flow.showRefs === 'afterSubmit' && ex.flow.attempts === 'free') {
    out.push({ code: 'REFS_AFTER_SUBMIT_WITH_RETRIES', level: 'warning', step: 4 });
  }

  return out;
}

/**
 * The one audio rule this type owns — plan 56 §4, phase 6.
 *
 * A transcript shown from the start hands this exercise away: the clip is the passage
 * read *correctly*, so its words are the corrections the student is being asked to make.
 * `after` and `never` are both fine — the first is the model answer arriving when the
 * work is in, which every other template does too.
 *
 * It lives here rather than in the shared `audioIssues` because INTEGRATION.md forbids
 * patching that list per template: the layer is written once for thirteen documents, and
 * a rule that names one of them belongs to that one. Both surfaces that enforce it — the
 * builder's rail and the server's publish preflight — call this.
 *
 * Takes raw content rather than an `ErrorCorrection` because the audio block belongs to
 * no template and `fromPersisted` does not carry it.
 */
export function transcriptGivesAway(content: unknown): boolean {
  const audio = audioOf(content);
  return audio.enabled && audio.settings.transcriptWhen === 'always';
}

export const blockers = (ex: ErrorCorrection): Issue[] =>
  issues(ex).filter((issue) => issue.level === 'blocker');

export const warnings = (ex: ErrorCorrection): Issue[] =>
  issues(ex).filter((issue) => issue.level === 'warning');

export const isReady = (ex: ErrorCorrection): boolean => blockers(ex).length === 0;

export type StepState = 'ok' | 'warn' | 'err' | 'empty';

/**
 * The dot on one step of the rail. `info` is deliberately not counted — it is a remark,
 * and a rail dot that goes amber for a remark trains the author to ignore amber.
 */
export function stepState(ex: ErrorCorrection, step: IssueStep): { state: StepState; blockers: number } {
  const mine = issues(ex).filter((issue) => issue.step === step && issue.level !== 'info');
  const blocking = mine.filter((issue) => issue.level === 'blocker').length;

  if (blocking > 0) return { state: 'err', blockers: blocking };
  if (mine.length > 0) return { state: 'warn', blockers: 0 };
  if (step === 2 && authoredItems(ex).length === 0) return { state: 'empty', blockers: 0 };
  return { state: 'ok', blockers: 0 };
}
