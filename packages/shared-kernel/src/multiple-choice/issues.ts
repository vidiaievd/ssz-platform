// The validation engine for `multiple_choice`.
//
// IMPLEMENTATION.md states the rule this file exists to keep: "Port `mcIssues` verbatim
// in behaviour. Every validation surface in the UI is a filter over its output;
// re-deriving rules per screen is how the builder drifts." The rail dots, the inline
// messages on a card, the pre-assign gate and the server's publish preflight all read
// this one list.
//
// Issues carry a code and the parameters its message needs, never the message itself:
// the teacher UI is localised into four languages, so English prose in shared logic could
// not be rendered (plan 53 §3.6).
//
// Every issue names the question it is about, and the option where the fix is one row.
// The prototype counted instead ("3 questions have no text"); a count cannot be shown on
// the card it belongs to and lies as soon as the questions are reordered (plan 53 §5).

import { correctOption, filledOptions, isAnswerable } from './derive.js';
import { normalizeText, packFor } from './language.js';
import type { MultipleChoiceContent, Question } from './model.js';
import { kindConfig } from './model.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's deep links both use it. */
export type IssueStep = 1 | 2 | 3 | 4;

export type Issue =
  // ── Step 1 — questions and options ──
  | { code: 'EX_NO_QUESTIONS'; level: 'blocker'; step: 1 }
  | { code: 'EX_NO_ANSWERABLE_QUESTION'; level: 'blocker'; step: 1 }
  | { code: 'Q_NO_STEM'; level: 'blocker'; step: 1; questionId: string }
  | { code: 'Q_TOO_FEW_OPTIONS'; level: 'blocker'; step: 1; questionId: string; count: number }
  | { code: 'Q_NO_KEY'; level: 'blocker'; step: 1; questionId: string }
  | { code: 'Q_EMPTY_OPTION'; level: 'warning'; step: 1; questionId: string }
  | { code: 'Q_NO_PASSAGE'; level: 'warning'; step: 1; questionId: string }
  // ── Step 2 — distractors ──
  | { code: 'OPT_DUPLICATE'; level: 'warning'; step: 2; questionId: string; optionId: string }
  | { code: 'KEY_TOO_LONG'; level: 'warning'; step: 2; questionId: string; optionId: string }
  | { code: 'KEY_TOO_SHORT'; level: 'warning'; step: 2; questionId: string; optionId: string }
  | { code: 'Q_TWO_OPTIONS'; level: 'warning'; step: 2; questionId: string }
  | { code: 'OPT_ABSOLUTE'; level: 'info'; step: 2; questionId: string; optionId: string }
  | { code: 'OPT_ALL_OF_THESE'; level: 'info'; step: 2; questionId: string; optionId: string }
  // ── Step 3 — difficulty ──
  | { code: 'INSTANT_WITH_RETRY'; level: 'warning'; step: 3 }
  | { code: 'ELIMINATE_WITHOUT_RETRY'; level: 'warning'; step: 3 }
  // ── Step 4 — feedback ──
  | { code: 'Q_NO_WHY'; level: 'blocker'; step: 4; questionId: string }
  | { code: 'NO_OPTION_FEEDBACK'; level: 'warning'; step: 4 };

export type IssueCode = Issue['code'];

/**
 * The language of the course, used by the distractor audit alone (language.ts).
 *
 * Optional on purpose: a caller that does not know the language gets an audit with the
 * two language-bound checks silent, not an audit that guesses Norwegian.
 */
export interface IssueOptions {
  language?: string;
}

/** Everything wrong with the document, in authoring order: step 1, then 2, 3, 4. */
export function issues(ex: MultipleChoiceContent, options: IssueOptions = {}): Issue[] {
  const out: Issue[] = [];
  const s = ex.settings;

  // ── Step 1 ────────────────────────────────────────────────────────────────
  if (ex.questions.length === 0) out.push({ code: 'EX_NO_QUESTIONS', level: 'blocker', step: 1 });

  for (const q of ex.questions) {
    const filled = filledOptions(q);
    if (q.stem.trim() === '') {
      out.push({ code: 'Q_NO_STEM', level: 'blocker', step: 1, questionId: q.id });
    }
    if (filled.length < 2) {
      out.push({
        code: 'Q_TOO_FEW_OPTIONS',
        level: 'blocker',
        step: 1,
        questionId: q.id,
        count: filled.length,
      });
    }
    const key = correctOption(q);
    if (key === null || key.text.trim() === '') {
      out.push({ code: 'Q_NO_KEY', level: 'blocker', step: 1, questionId: q.id });
    }
    if (q.options.some((o) => o.text.trim() === '')) {
      out.push({ code: 'Q_EMPTY_OPTION', level: 'warning', step: 1, questionId: q.id });
    }
    if (kindConfig(q.kind).needsPassage && q.context.trim() === '') {
      out.push({ code: 'Q_NO_PASSAGE', level: 'warning', step: 1, questionId: q.id });
    }
  }

  // "No finished question yet" is a separate blocker from the per-question ones: a
  // document can have every card half-written and no single card that would render.
  if (ex.questions.length > 0 && !ex.questions.some(isAnswerable)) {
    out.push({ code: 'EX_NO_ANSWERABLE_QUESTION', level: 'blocker', step: 1 });
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  for (const q of ex.questions) out.push(...audit(q, options));

  // ── Step 3 ────────────────────────────────────────────────────────────────
  if (s.instant && s.retry !== 'none') out.push({ code: 'INSTANT_WITH_RETRY', level: 'warning', step: 3 });
  if (s.eliminate && s.retry === 'none') {
    out.push({ code: 'ELIMINATE_WITHOUT_RETRY', level: 'warning', step: 3 });
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  for (const q of ex.questions) {
    if (q.why.trim() === '') out.push({ code: 'Q_NO_WHY', level: 'blocker', step: 4, questionId: q.id });
  }
  const cov = coverage(ex);
  if (s.showWhyWrong && cov.wrongs > 0 && cov.written === 0) {
    out.push({ code: 'NO_OPTION_FEEDBACK', level: 'warning', step: 4 });
  }

  return out;
}

/**
 * The distractor audit — README "Distractor audit", the part of MC writing that actually
 * goes wrong.
 *
 * Exported separately because step 2 renders each flag under the option it names rather
 * than in a list, and wants them for one question without re-running the document.
 */
export function audit(q: Question, options: IssueOptions = {}): Issue[] {
  const out: Issue[] = [];
  const opts = filledOptions(q);
  if (opts.length === 0) return out;

  const key = correctOption(q);
  const pack = packFor(options.language);

  // Two options that say the same thing. The second occurrence is the one flagged, so the
  // message lands on the row the author most likely meant to change.
  const seen = new Map<string, string>();
  for (const o of opts) {
    const text = normalizeText(o.text, options.language);
    if (seen.has(text)) {
      out.push({ code: 'OPT_DUPLICATE', level: 'warning', step: 2, questionId: q.id, optionId: o.id });
    } else {
      seen.set(text, o.id);
    }
  }

  // Length tells. A key noticeably longer than every distractor is picked without reading.
  if (key !== null && key.text.trim() !== '') {
    const keyLength = key.text.trim().length;
    const others = opts.filter((o) => !o.correct).map((o) => o.text.trim().length);
    if (others.length > 0) {
      if (keyLength > Math.max(...others) * 1.6 && keyLength > 18) {
        out.push({ code: 'KEY_TOO_LONG', level: 'warning', step: 2, questionId: q.id, optionId: key.id });
      }
      if (keyLength < Math.min(...others) * 0.5) {
        out.push({ code: 'KEY_TOO_SHORT', level: 'warning', step: 2, questionId: q.id, optionId: key.id });
      }
    }
  }

  // Language-bound checks. Silent without a pack for the course language — plan 53 §3.6.
  if (pack !== null) {
    for (const o of opts) {
      if (o.correct) continue;
      if (pack.absolutes.test(o.text) && key !== null && !pack.absolutes.test(key.text)) {
        out.push({ code: 'OPT_ABSOLUTE', level: 'info', step: 2, questionId: q.id, optionId: o.id });
      }
      if (pack.allOfThese.test(o.text.trim())) {
        out.push({ code: 'OPT_ALL_OF_THESE', level: 'info', step: 2, questionId: q.id, optionId: o.id });
      }
    }
  }

  if (opts.length === 2) out.push({ code: 'Q_TWO_OPTIONS', level: 'warning', step: 2, questionId: q.id });

  return out;
}

/** The numbers behind the coverage strips on steps 2 and 4 — README `mcCoverage`. */
export interface Coverage {
  /** Wrong options with text, across the document. */
  wrongs: number;
  /** How many of them have a rebuttal written. */
  written: number;
  /** Questions with no rule behind the right answer. */
  noWhy: number;
  /** Questions the audit has nothing to say about (step 2's strip). */
  clean: number;
  total: number;
}

export function coverage(ex: MultipleChoiceContent, options: IssueOptions = {}): Coverage {
  let wrongs = 0;
  let written = 0;
  let noWhy = 0;
  let clean = 0;

  for (const q of ex.questions) {
    if (q.why.trim() === '') noWhy += 1;
    for (const o of filledOptions(q)) {
      if (o.correct) continue;
      wrongs += 1;
      if (o.why.trim() !== '') written += 1;
    }
    if (!audit(q, options).some((flag) => flag.level === 'warning')) clean += 1;
  }

  return { wrongs, written, noWhy, clean, total: ex.questions.length };
}

/**
 * Whether the exercise may be published or assigned. False exactly when a blocker exists —
 * the same question the gate and the server's preflight both ask.
 */
export function isReady(ex: MultipleChoiceContent, options: IssueOptions = {}): boolean {
  return !issues(ex, options).some((issue) => issue.level === 'blocker');
}

export function blockers(ex: MultipleChoiceContent, options: IssueOptions = {}): Issue[] {
  return issues(ex, options).filter((issue) => issue.level === 'blocker');
}

export function warnings(ex: MultipleChoiceContent, options: IssueOptions = {}): Issue[] {
  return issues(ex, options).filter((issue) => issue.level === 'warning');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/**
 * Drives the step rail's dots — README "Step rail".
 *
 * `'empty'` is reachable here, unlike in `short_answer`: a document whose only question
 * is an untouched scaffold raises its blockers on steps 1 and 4, so step **3** — which has
 * no per-question rules at all — legitimately reports "nothing written yet" rather than a
 * false green. Steps 1, 2 and 4 answer `'err'` first, as the handoff intends.
 */
export function stepState(
  ex: MultipleChoiceContent,
  step: IssueStep,
  options: IssueOptions = {},
): StepState {
  const stepIssues = issues(ex, options).filter((i) => i.step === step && i.level !== 'info');
  const errs = stepIssues.filter((i) => i.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (stepIssues.length > 0) return { s: 'warn', errs: 0 };
  if (!ex.questions.some((q) => q.stem.trim() !== '')) return { s: 'empty', errs: 0 };
  return { s: 'ok', errs: 0 };
}
