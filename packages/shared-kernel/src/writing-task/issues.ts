// The validation engine for `writing_task` — BEHAVIOR.md §1 "one engine, every surface
// filters it": the builder's rail dots, its field messages and the pre-assign gate all
// read this list, and so does the server on save/assign (IMPLEMENTATION.md "Rules" —
// blockers must run server-side too, not only in the gate). One function, so that the
// client and the server agree on the same codes for the same document by construction.
//
// Issues carry a code and the parameters its message needs, never the message itself —
// the teacher UI is localised into four languages, so English prose in shared logic
// could not be rendered.

import { rubricMax, usablePoints } from './analysis.js';
import type { Criterion, WritingTaskContent } from './model.js';
import { modeConfig } from './model.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's deep links both use it. */
export type IssueStep = 1 | 2 | 3 | 4;

export type Issue =
  | { code: 'EX_NO_PROMPT'; level: 'blocker'; step: 1 }
  | { code: 'MODE_NO_SOURCE'; level: 'blocker'; step: 1 }
  | { code: 'MODE_NO_RECIPIENT'; level: 'warning'; step: 1 }
  | { code: 'MODE_NO_IMAGE'; level: 'blocker'; step: 1 }
  | { code: 'EX_NO_POINTS'; level: 'blocker'; step: 1 }
  | { code: 'POINTS_TOO_MANY'; level: 'warning'; step: 1; count: number }
  | { code: 'POINT_NO_KEYWORDS'; level: 'warning'; step: 1; pointId: string }
  | { code: 'EX_NO_MODEL'; level: 'warning'; step: 3 }
  | { code: 'LEN_MAX_LTE_MIN'; level: 'blocker'; step: 2 }
  | { code: 'TIMER_TOO_SHORT'; level: 'warning'; step: 2; timer: number; minWords: number }
  | { code: 'CRIT_NO_NAME'; level: 'blocker'; step: 3; criterionId: string }
  | { code: 'RUBRIC_EMPTY'; level: 'blocker'; step: 3 }
  | { code: 'PASS_SCORE_TOO_HIGH'; level: 'blocker'; step: 3; passScore: number; max: number }
  | { code: 'CRIT_LEVEL_EMPTY'; level: 'warning'; step: 3; criterionId: string }
  | { code: 'AI_NO_SELF_LIMIT'; level: 'warning'; step: 4 }
  | { code: 'AI_STAGE_OFF_DRAFT_ON'; level: 'info'; step: 4 };

export type IssueCode = Issue['code'];

/**
 * Every problem with the document, in authoring order: step 1, then 2, then 3, then 4,
 * and within a step in the order the teacher would meet them.
 */
export function issues(ex: WritingTaskContent): Issue[] {
  const out: Issue[] = [];
  const mode = modeConfig(ex.mode);
  const s = ex.settings;
  const points = usablePoints(ex);

  // ── Step 1 — the task ────────────────────────────────────────────────────
  if (ex.prompt.trim() === '') out.push({ code: 'EX_NO_PROMPT', level: 'blocker', step: 1 });
  if (mode.needs === 'source' && ex.source.trim() === '') {
    out.push({ code: 'MODE_NO_SOURCE', level: 'blocker', step: 1 });
  }
  if (mode.needs === 'letter' && ex.letter.recipient.trim() === '') {
    out.push({ code: 'MODE_NO_RECIPIENT', level: 'warning', step: 1 });
  }
  if (mode.needs === 'image' && !ex.image.assetId) {
    out.push({ code: 'MODE_NO_IMAGE', level: 'blocker', step: 1 });
  }
  if (points.length === 0) out.push({ code: 'EX_NO_POINTS', level: 'blocker', step: 1 });
  if (points.length > 5) out.push({ code: 'POINTS_TOO_MANY', level: 'warning', step: 1, count: points.length });
  if (s.ai.task) {
    for (const point of points) {
      if (!point.keywords.some((k) => k.trim() !== '')) {
        out.push({ code: 'POINT_NO_KEYWORDS', level: 'warning', step: 1, pointId: point.id });
      }
    }
  }

  // ── Step 2 — the frame ───────────────────────────────────────────────────
  if (s.maxWords > 0 && s.maxWords <= s.minWords) {
    out.push({ code: 'LEN_MAX_LTE_MIN', level: 'blocker', step: 2 });
  }
  if (s.timer > 0 && s.timer < 10 && s.minWords > 120) {
    out.push({ code: 'TIMER_TOO_SHORT', level: 'warning', step: 2, timer: s.timer, minWords: s.minWords });
  }

  // ── Step 3 — the rubric ──────────────────────────────────────────────────
  if (ex.rubric.length === 0) {
    out.push({ code: 'RUBRIC_EMPTY', level: 'blocker', step: 3 });
  } else {
    for (const c of ex.rubric) {
      if (c.name.trim() === '') out.push({ code: 'CRIT_NO_NAME', level: 'blocker', step: 3, criterionId: c.id });
    }
  }
  const max = rubricMax(ex);
  if (s.passScore > max) {
    out.push({ code: 'PASS_SCORE_TOO_HIGH', level: 'blocker', step: 3, passScore: s.passScore, max });
  }
  for (const c of ex.rubric) {
    if (hasEmptyLevel(c)) out.push({ code: 'CRIT_LEVEL_EMPTY', level: 'warning', step: 3, criterionId: c.id });
  }
  if (ex.model.trim() === '') out.push({ code: 'EX_NO_MODEL', level: 'warning', step: 3 });

  // ── Step 4 — flow and AI ─────────────────────────────────────────────────
  if (s.aiStage && s.aiVisibility === 'studentBefore' && s.aiSelfLimit === 0) {
    out.push({ code: 'AI_NO_SELF_LIMIT', level: 'warning', step: 4 });
  }
  if (!s.aiStage && s.ai.draft) {
    out.push({ code: 'AI_STAGE_OFF_DRAFT_ON', level: 'info', step: 4 });
  }

  return out;
}

function hasEmptyLevel(c: Criterion): boolean {
  return c.levels.some((level) => level.trim() === '');
}

/**
 * Whether the exercise may be assigned. False exactly when a blocker exists — the same
 * question the pre-assign gate and the server's assign-time check both ask.
 */
export function isReady(ex: WritingTaskContent): boolean {
  return !issues(ex).some((issue) => issue.level === 'blocker');
}

export function blockers(ex: WritingTaskContent): Issue[] {
  return issues(ex).filter((issue) => issue.level === 'blocker');
}

export function warnings(ex: WritingTaskContent): Issue[] {
  return issues(ex).filter((issue) => issue.level === 'warning');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/** Drives the step rail's dots — BEHAVIOR.md §1. */
export function stepState(ex: WritingTaskContent, step: IssueStep): StepState {
  const stepIssues = issues(ex).filter((issue) => issue.step === step && issue.level !== 'info');
  const errs = stepIssues.filter((issue) => issue.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (stepIssues.length > 0) return { s: 'warn', errs: 0 };
  if (step === 1 && ex.prompt.trim() === '') return { s: 'empty', errs: 0 };
  return { s: 'ok', errs: 0 };
}
