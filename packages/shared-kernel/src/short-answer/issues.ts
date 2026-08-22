// The validation engine for `short_answer` — README "Validation rules: one engine,
// every surface filters it". The rail dots, the inline messages under a field, the
// pre-assign gate and the server's publish preflight all read this list. One function,
// so the client and the server agree on the same codes for the same document by
// construction (the same reasoning as writing-task/issues.ts).
//
// Issues carry a code and the parameters its message needs, never the message itself:
// the teacher UI is localised into four languages, so English prose in shared logic
// could not be rendered.
//
// The key audit (README "Key audit") lives here too rather than in its own module: its
// warn-level flags are step-2 issues like any other, and the builder needs them keyed
// by element so it can render each one under the row it is about.

import { modelPasses, usableElements } from './grading.js';
import { hasAnchor, normalize, words } from './matching.js';
import type { Question, ShortAnswerContent } from './model.js';
import { kindConfig } from './model.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's deep links both use it. */
export type IssueStep = 1 | 2 | 3 | 4;

/**
 * Every issue names the question it is about (`questionId`) and, where the fix is a
 * single row, the element (`elementId`). The prototype counted questions instead
 * ("3 questions have no text"); ids survive reordering and let the builder put the
 * message on the card it belongs to, which the counts cannot.
 */
export type Issue =
  // ── Step 1 — the questions ──
  | { code: 'EX_NO_QUESTIONS'; level: 'blocker'; step: 1 }
  | { code: 'Q_NO_PROMPT'; level: 'blocker'; step: 1; questionId: string }
  | { code: 'Q_NO_MODEL'; level: 'blocker'; step: 1; questionId: string }
  | { code: 'Q_NO_PASSAGE'; level: 'warning'; step: 1; questionId: string }
  // ── Step 2 — the answer key ──
  | { code: 'Q_NO_KEY'; level: 'blocker'; step: 2; questionId: string }
  | { code: 'Q_MODEL_FAILS_KEY'; level: 'blocker'; step: 2; questionId: string; covered: number; total: number }
  | { code: 'EL_NO_ANCHOR'; level: 'warning'; step: 2; questionId: string; elementId: string }
  | { code: 'EL_ANCHOR_NOT_IN_MODEL'; level: 'warning'; step: 2; questionId: string; elementId: string; anchor: string }
  | { code: 'EL_ANCHOR_TOO_SHORT'; level: 'info'; step: 2; questionId: string; elementId: string; anchor: string }
  | { code: 'EL_ONE_ANCHOR'; level: 'info'; step: 2; questionId: string; elementId: string }
  | { code: 'Q_TOO_MANY_ELEMENTS'; level: 'warning'; step: 2; questionId: string; count: number }
  // ── Step 3 — verdict and feedback ──
  | { code: 'Q_NO_WHY'; level: 'blocker'; step: 3; questionId: string }
  | { code: 'PASS_N_TOO_HIGH'; level: 'warning'; step: 3; passN: number }
  // ── Step 4 — review ──
  | { code: 'NO_TEACHER_REVIEW'; level: 'warning'; step: 4 };

export type IssueCode = Issue['code'];

/** Everything wrong with the document, in authoring order: step 1, then 2, 3, 4. */
export function issues(ex: ShortAnswerContent): Issue[] {
  const out: Issue[] = [];
  const s = ex.settings;

  // ── Step 1 ────────────────────────────────────────────────────────────────
  if (ex.questions.length === 0) out.push({ code: 'EX_NO_QUESTIONS', level: 'blocker', step: 1 });

  for (const q of ex.questions) {
    if (q.prompt.trim() === '') {
      out.push({ code: 'Q_NO_PROMPT', level: 'blocker', step: 1, questionId: q.id });
    }
    // A question with no prompt is not yet a question; asking for its model answer as
    // well would put two blockers on one empty card and say nothing extra.
    if (q.prompt.trim() !== '' && q.model.trim() === '') {
      out.push({ code: 'Q_NO_MODEL', level: 'blocker', step: 1, questionId: q.id });
    }
    if (kindConfig(q.kind).needsPassage && q.passage.trim() === '') {
      out.push({ code: 'Q_NO_PASSAGE', level: 'warning', step: 1, questionId: q.id });
    }
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  for (const q of ex.questions) {
    const usable = usableElements(q);
    if (q.prompt.trim() !== '' && usable.length === 0) {
      out.push({ code: 'Q_NO_KEY', level: 'blocker', step: 2, questionId: q.id });
    }
    if (usable.length > 0 && q.model.trim() !== '' && !modelPasses(q, s)) {
      const result = gradeModel(q, s.typos);
      out.push({
        code: 'Q_MODEL_FAILS_KEY',
        level: 'blocker',
        step: 2,
        questionId: q.id,
        covered: result.covered,
        total: result.total,
      });
    }
    out.push(...audit(q, ex));
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  for (const q of ex.questions) {
    if (q.why.trim() === '') out.push({ code: 'Q_NO_WHY', level: 'blocker', step: 3, questionId: q.id });
  }
  if (s.passRule === 'n' && ex.questions.some((q) => s.passN > requiredCount(q))) {
    out.push({ code: 'PASS_N_TOO_HIGH', level: 'warning', step: 3, passN: s.passN });
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  if (s.teacherReview === 'none') out.push({ code: 'NO_TEACHER_REVIEW', level: 'warning', step: 4 });

  return out;
}

/**
 * The key audit — README "Key audit", rendered inline under the element it names.
 *
 * Exported separately because step 2 shows these where they belong rather than in a
 * list, and it wants them without re-running the whole document.
 */
export function audit(q: Question, ex: ShortAnswerContent): Issue[] {
  const out: Issue[] = [];
  const modelWords = words(q.model);
  const hasModel = q.model.trim() !== '';

  for (const e of q.elements) {
    const anchors = e.anchors.filter((a) => a.trim() !== '');
    const labelled = e.label.trim() !== '';

    if (labelled && anchors.length === 0) {
      out.push({ code: 'EL_NO_ANCHOR', level: 'warning', step: 2, questionId: q.id, elementId: e.id });
    }
    for (const anchor of anchors) {
      if (words(anchor).length === 1 && normalize(anchor).length <= 3) {
        out.push({
          code: 'EL_ANCHOR_TOO_SHORT',
          level: 'info',
          step: 2,
          questionId: q.id,
          elementId: e.id,
          anchor,
        });
      }
      // Only worth saying when it is the element's *only* anchor: with variants, one of
      // them not matching the model answer is the point of writing variants.
      if (hasModel && anchors.length === 1 && !hasAnchor(modelWords, anchor, ex.settings.typos)) {
        out.push({
          code: 'EL_ANCHOR_NOT_IN_MODEL',
          level: 'warning',
          step: 2,
          questionId: q.id,
          elementId: e.id,
          anchor,
        });
      }
    }
    if (labelled && anchors.length === 1) {
      out.push({ code: 'EL_ONE_ANCHOR', level: 'info', step: 2, questionId: q.id, elementId: e.id });
    }
  }

  const labelled = q.elements.filter((e) => e.label.trim() !== '').length;
  if (labelled > 4) {
    out.push({ code: 'Q_TOO_MANY_ELEMENTS', level: 'warning', step: 2, questionId: q.id, count: labelled });
  }
  return out;
}

/**
 * Whether the exercise may be published or assigned. False exactly when a blocker
 * exists — the same question the gate and the server's preflight both ask.
 */
export function isReady(ex: ShortAnswerContent): boolean {
  return !issues(ex).some((issue) => issue.level === 'blocker');
}

export function blockers(ex: ShortAnswerContent): Issue[] {
  return issues(ex).filter((issue) => issue.level === 'blocker');
}

export function warnings(ex: ShortAnswerContent): Issue[] {
  return issues(ex).filter((issue) => issue.level === 'warning');
}

/**
 * `'empty'` is carried because README names it, but it is unreachable in practice and
 * the rail should not be written expecting it: the two ways step 1 can hold no written
 * question — no questions at all, or a question with no prompt — are both blockers, so
 * the `'err'` branch answers first. It stays here rather than being dropped so that a
 * future rule change (an unsaved scaffold that raises no blocker, say) has the state it
 * would need; nothing renders it today.
 */
export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/** Drives the step rail's dots — README "Step rail". */
export function stepState(ex: ShortAnswerContent, step: IssueStep): StepState {
  const stepIssues = issues(ex).filter((issue) => issue.step === step && issue.level !== 'info');
  const errs = stepIssues.filter((issue) => issue.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (stepIssues.length > 0) return { s: 'warn', errs: 0 };
  if (step === 1 && !ex.questions.some((q) => q.prompt.trim() !== '')) return { s: 'empty', errs: 0 };
  return { s: 'ok', errs: 0 };
}

function requiredCount(q: Question): number {
  return usableElements(q).filter((e) => e.required).length;
}

/** Coverage of the model answer, for the failing-key blocker's `N of M` parameters. */
function gradeModel(q: Question, typos: boolean): { covered: number; total: number } {
  const modelWords = words(q.model);
  const required = usableElements(q).filter((e) => e.required);
  const covered = required.filter((e) =>
    e.anchors.some((a) => a.trim() !== '' && hasAnchor(modelWords, a, typos)),
  ).length;
  return { covered, total: required.length };
}
