// The validation engine for `multiple_choice_group`.
//
// README states the rule this file exists to keep: "Port `mgIssues` verbatim in behaviour.
// Every validation surface is a filter over its output; re-deriving rules per screen is how
// the builder drifts." The rail dots, the inline messages under a row, the pre-assign gate
// and the server's publish preflight all read this one list.
//
// Issues carry a code and the parameters its message needs, never the message itself: the
// teacher UI is localised into four languages, so English prose in shared logic could not
// be rendered (plan 53 §3.6, deviation 2 of plan 54 §5).
//
// Every issue that is about one row names it. The prototype counted instead ("3 statements
// have no answer marked"); a count cannot be rendered under the row it belongs to and lies
// as soon as the rows are reordered (plan 53 §5, carried).

import { balance, coverage, isAnswered, quoteFound, readyRows, writtenRows } from './derive.js';
import { countNegations, normalizeText, packFor } from './language.js';
import type { MultipleChoiceGroupContent } from './model.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's deep links both use it. */
export type IssueStep = 1 | 2 | 3 | 4;

export type Issue =
  // ── Step 1 — the material and the columns ──
  | { code: 'COL_TOO_FEW'; level: 'blocker'; step: 1; count: number }
  | { code: 'COL_TOO_MANY'; level: 'blocker'; step: 1; count: number }
  | { code: 'COL_NO_LABEL'; level: 'blocker'; step: 1; columnId: string }
  | { code: 'COL_DUPLICATE'; level: 'blocker'; step: 1; columnId: string }
  | { code: 'SOURCE_EMPTY'; level: 'blocker'; step: 1 }
  | { code: 'EX_NO_INSTRUCTION'; level: 'warning'; step: 1 }
  | { code: 'SOURCE_NONE'; level: 'info'; step: 1 }
  // ── Step 2 — the statements ──
  | { code: 'EX_NO_ROWS'; level: 'blocker'; step: 2 }
  | { code: 'ROW_NO_ANSWER'; level: 'blocker'; step: 2; rowId: string }
  | { code: 'EX_TOO_FEW_READY'; level: 'blocker'; step: 2; count: number }
  | { code: 'ROW_EMPTY'; level: 'warning'; step: 2; count: number }
  // ── Step 2 — statement audit ──
  | { code: 'ROW_DUPLICATE'; level: 'warning'; step: 2; rowId: string }
  | { code: 'ROW_TOO_LONG'; level: 'warning'; step: 2; rowId: string; length: number }
  | { code: 'ROW_DOUBLE_NEGATIVE'; level: 'warning'; step: 2; rowId: string }
  | { code: 'KEY_LOPSIDED'; level: 'warning'; step: 2; columnId: string; share: number }
  | { code: 'COL_UNUSED'; level: 'warning'; step: 2; columnId: string }
  | { code: 'ROW_ABSOLUTE'; level: 'info'; step: 2; rowId: string }
  | { code: 'ROW_IS_QUESTION'; level: 'info'; step: 2; rowId: string }
  | { code: 'EX_FEW_ROWS'; level: 'info'; step: 2; count: number }
  | { code: 'EX_MANY_ROWS'; level: 'info'; step: 2; count: number }
  // ── Step 3 — difficulty ──
  | { code: 'NO_RETRY_NO_KEY'; level: 'warning'; step: 3 }
  | { code: 'UNLIMITED_UNLOCKED'; level: 'warning'; step: 3 }
  | { code: 'THRESHOLD_NEAR_CHANCE'; level: 'info'; step: 3; threshold: number }
  // ── Step 4 — feedback ──
  | { code: 'NO_EXPLANATIONS'; level: 'blocker'; step: 4 }
  | { code: 'ROW_NO_WHY'; level: 'warning'; step: 4; rowId: string }
  | { code: 'NO_QUOTES'; level: 'info'; step: 4 }
  | { code: 'QUOTE_NOT_IN_TEXT'; level: 'warning'; step: 4; rowId: string };

export type IssueCode = Issue['code'];

/**
 * The language of the course, used by the statement audit alone (language.ts).
 *
 * Optional on purpose: a caller that does not know the language gets an audit with the
 * language-bound checks silent, not an audit that guesses Norwegian.
 */
export interface IssueOptions {
  language?: string;
}

/** Everything wrong with the document, in authoring order: step 1, then 2, 3, 4. */
export function issues(
  ex: MultipleChoiceGroupContent,
  options: IssueOptions = {},
): Issue[] {
  const out: Issue[] = [];
  const s = ex.settings;
  const written = writtenRows(ex);
  const ready = readyRows(ex);

  // ── Step 1 ────────────────────────────────────────────────────────────────
  if (ex.columns.length < 2) {
    out.push({ code: 'COL_TOO_FEW', level: 'blocker', step: 1, count: ex.columns.length });
  }
  if (ex.columns.length > 4) {
    out.push({ code: 'COL_TOO_MANY', level: 'blocker', step: 1, count: ex.columns.length });
  }
  for (const c of ex.columns) {
    if (c.label.trim() === '') {
      out.push({ code: 'COL_NO_LABEL', level: 'blocker', step: 1, columnId: c.id });
    }
  }
  // The *second* occurrence is flagged, so the message lands on the column the author most
  // likely meant to change — the same choice the duplicate-statement check makes below.
  const seenLabels = new Set<string>();
  for (const c of ex.columns) {
    const label = c.label.trim().toLowerCase();
    if (label === '') continue;
    if (seenLabels.has(label)) {
      out.push({ code: 'COL_DUPLICATE', level: 'blocker', step: 1, columnId: c.id });
    }
    seenLabels.add(label);
  }
  if (ex.source.mode === 'inline' && ex.source.text.trim() === '') {
    out.push({ code: 'SOURCE_EMPTY', level: 'blocker', step: 1 });
  }
  if (ex.instruction.trim() === '') {
    out.push({ code: 'EX_NO_INSTRUCTION', level: 'warning', step: 1 });
  }
  if (ex.source.mode === 'none' && written.length > 0) {
    out.push({ code: 'SOURCE_NONE', level: 'info', step: 1 });
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  if (ex.rows.length === 0) out.push({ code: 'EX_NO_ROWS', level: 'blocker', step: 2 });

  // Only once *something* is written. A brand-new document is four blank rows — the
  // scaffold `emptyContent` creates — and warning that they will be dropped is noise on a
  // table the author has not started. It is also the only way BEHAVIOR B5 can happen: the
  // prototype raises this warning unconditionally, which makes its own "grey dashed empty
  // dot" unreachable, since the alternative (no rows at all) is a blocker. B5 is the spec,
  // so the warning yields to it (plan 54 §5, deviation 5).
  const empty = ex.rows.length - written.length;
  if (empty > 0 && written.length > 0) {
    out.push({ code: 'ROW_EMPTY', level: 'warning', step: 2, count: empty });
  }

  for (const r of written) {
    if (!isAnswered(ex, r)) {
      out.push({ code: 'ROW_NO_ANSWER', level: 'blocker', step: 2, rowId: r.id });
    }
  }

  // "Fewer than two finished statements" is a separate blocker from the per-row ones: a
  // document can have every row half-written and no single row that would render.
  //
  // Unconditional, as README's blocker table states it. The prototype guards it with "and
  // at least one row is written", which leaves an untouched document — four blank rows, the
  // scaffold — with no blockers at all: `isReady` returns true and the gate offers to
  // publish an empty table. `stepState` is what keeps the rail from shouting at an author
  // who has not started (see B5 there); the gate and the publish preflight refuse it.
  if (ex.rows.length > 0 && ready.length < 2) {
    out.push({ code: 'EX_TOO_FEW_READY', level: 'blocker', step: 2, count: ready.length });
  }

  out.push(...audit(ex, options));

  // ── Step 3 ────────────────────────────────────────────────────────────────
  if (s.retry === 'none' && !s.revealKey) {
    out.push({ code: 'NO_RETRY_NO_KEY', level: 'warning', step: 3 });
  }
  if (s.retry === 'unlimited' && !s.lockCorrect) {
    out.push({ code: 'UNLIMITED_UNLOCKED', level: 'warning', step: 3 });
  }
  if (s.passThreshold < 50) {
    out.push({
      code: 'THRESHOLD_NEAR_CHANCE',
      level: 'info',
      step: 3,
      threshold: s.passThreshold,
    });
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  const cov = coverage(ex);
  if (s.showWhy !== 'never' && cov.total > 0 && cov.written === 0) {
    out.push({ code: 'NO_EXPLANATIONS', level: 'blocker', step: 4 });
  }
  // Named per row rather than counted, unlike the prototype: "3 statements have no
  // explanation" cannot be rendered on the card that needs filling in.
  if (s.showWhy !== 'never' && cov.written > 0) {
    for (const r of ready) {
      if (r.why.trim() === '') out.push({ code: 'ROW_NO_WHY', level: 'warning', step: 4, rowId: r.id });
    }
  }
  if (ex.source.mode === 'inline') {
    if (cov.total > 0 && cov.quoted === 0) {
      out.push({ code: 'NO_QUOTES', level: 'info', step: 4 });
    }
    for (const r of ready) {
      if (r.quote.trim() !== '' && !quoteFound(ex.source.text, r.quote)) {
        out.push({ code: 'QUOTE_NOT_IN_TEXT', level: 'warning', step: 4, rowId: r.id });
      }
    }
  }

  return out;
}

/**
 * The statement audit — README "Statement audit", the part of Riktig/Galt writing that
 * actually goes wrong.
 *
 * Exported separately because step 2 renders each flag under the row it names rather than
 * in a list, and wants them without re-running the whole document.
 */
export function audit(ex: MultipleChoiceGroupContent, options: IssueOptions = {}): Issue[] {
  const out: Issue[] = [];
  const written = writtenRows(ex);
  const pack = packFor(options.language);

  const seen = new Set<string>();
  for (const r of written) {
    const text = normalizeText(r.text);
    if (seen.has(text)) {
      out.push({ code: 'ROW_DUPLICATE', level: 'warning', step: 2, rowId: r.id });
    }
    seen.add(text);

    const length = r.text.trim().length;
    if (length > 170) {
      out.push({ code: 'ROW_TOO_LONG', level: 'warning', step: 2, rowId: r.id, length });
    }

    // Language-bound checks. Silent without a pack for the course language.
    if (pack !== null) {
      if (countNegations(r.text, pack) >= 2) {
        out.push({ code: 'ROW_DOUBLE_NEGATIVE', level: 'warning', step: 2, rowId: r.id });
      }
      if (pack.absolutes.test(r.text)) {
        out.push({ code: 'ROW_ABSOLUTE', level: 'info', step: 2, rowId: r.id });
      }
      // A question reads oddly under Riktig/Galt, but not under Ja/Nei — so the check asks
      // what the columns actually say rather than assuming a true-false pair.
      const answerLabel = ex.columns.find((c) => c.id === r.answer)?.label ?? '';
      const jaNei = ex.columns.some((c) => pack.affirmative.test(c.label.trim()));
      if (/\?\s*$/u.test(r.text.trim()) && !jaNei && !pack.affirmative.test(answerLabel.trim())) {
        out.push({ code: 'ROW_IS_QUESTION', level: 'info', step: 2, rowId: r.id });
      }
    }
  }

  const b = balance(ex);
  if (b.total >= 4 && b.top !== null && b.topShare >= 0.8) {
    out.push({
      code: 'KEY_LOPSIDED',
      level: 'warning',
      step: 2,
      columnId: b.top.id,
      share: b.topShare,
    });
  }
  if (b.total >= 3) {
    for (const c of b.unused) {
      out.push({ code: 'COL_UNUSED', level: 'warning', step: 2, columnId: c.id });
    }
  }
  if (b.total > 0 && b.total < 4) {
    out.push({ code: 'EX_FEW_ROWS', level: 'info', step: 2, count: b.total });
  }
  if (b.total > 15) {
    out.push({ code: 'EX_MANY_ROWS', level: 'info', step: 2, count: b.total });
  }

  return out;
}

/**
 * Whether the exercise may be published or assigned. False exactly when a blocker exists —
 * the same question the gate and the server's preflight both ask.
 */
export function isReady(ex: MultipleChoiceGroupContent, options: IssueOptions = {}): boolean {
  return !issues(ex, options).some((issue) => issue.level === 'blocker');
}

export function blockers(ex: MultipleChoiceGroupContent, options: IssueOptions = {}): Issue[] {
  return issues(ex, options).filter((issue) => issue.level === 'blocker');
}

export function warnings(ex: MultipleChoiceGroupContent, options: IssueOptions = {}): Issue[] {
  return issues(ex, options).filter((issue) => issue.level === 'warning');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/**
 * Drives the step rail's dots — BEHAVIOR B3-B6.
 *
 * `'empty'` is scoped to step 2 alone, and that is the handoff's own rule (B5: "Step 2 and
 * no row has text"), not a simplification. It is also the only step where it could be
 * honest: steps 1 and 3 have settings and columns from the moment the document is created,
 * so "nothing written yet" would be false there, and step 4 raises its own blocker instead.
 *
 * B5 is checked **before** the blockers, and that ordering is the one judgement in this
 * file. An untouched document does carry a step-2 blocker — it has no two finished
 * statements and never will until someone types — but opening a new exercise to a red
 * error badge on a table nobody has started is the builder telling an author off for
 * arriving. The rail says "nothing here yet"; the gate and the publish preflight still
 * refuse the document, because they read `issues` rather than this. The prototype gets the
 * same rail by dropping the blocker instead, which also makes an empty table publishable
 * (plan 54 §5, deviation 5).
 */
export function stepState(
  ex: MultipleChoiceGroupContent,
  step: IssueStep,
  options: IssueOptions = {},
): StepState {
  if (step === 2 && writtenRows(ex).length === 0) return { s: 'empty', errs: 0 };

  const stepIssues = issues(ex, options).filter((i) => i.step === step && i.level !== 'info');
  const errs = stepIssues.filter((i) => i.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (stepIssues.length > 0) return { s: 'warn', errs: 0 };
  return { s: 'ok', errs: 0 };
}
