// The validation engine for `read_aloud` — `raIssues` and `raStepState` of the handoff.
//
// One list drives the rail dots, the callouts in each step, the gate and the server's publish
// preflight. `blocker` is reserved for what makes the exercise physically unplayable or
// ungradable (spec 19 §1.2): nothing to record, an empty screen with an open microphone, a range
// nothing can be submitted in, an upload the ceiling refuses — and, by README idea 2, a prompt
// that tells the grader nothing about what to listen for.
//
// Issues carry a code and the parameters a message needs, never the message: the teacher UI is
// translated into four languages. Issues about one prompt or one criterion name it by id; the
// builder turns the id into «Avsnitt 1» or «Prompt 1».
//
// Material is checked for the current mode only — a passage left over from `read` on a
// monologue prompt is neither a problem nor a credit. Whether the audio layer is on is passed in:
// the layer's block is the builder's and the preflight's, not this model's. The layer's own
// issues are its own (`audioIssues`), folded into step 1 where its card sits.

import { hasMaterial, hasNote, planOf, rubricMax } from './derive.js';
import { LIMITS, readSeconds, wordCount } from './limits.js';
import type { ReadAloudContent } from './model.js';
import {
  modeConfig,
  RA_LONG_PLAN_POINTS,
  RA_LONG_TEXT_WORDS,
  RA_MANY_PROMPTS,
} from './model.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's jump links both use it. */
export type IssueStep = 1 | 2 | 3 | 4 | 5;

export type MaterialNeed = 'text' | 'support' | 'turn';

export type Issue =
  // ── Step 1 — the task ──
  | { code: 'RA_NO_PROMPTS'; level: 'blocker'; step: 1 }
  | { code: 'RA_PROMPT_NO_MATERIAL'; level: 'blocker'; step: 1; promptId: string; need: MaterialNeed }
  | { code: 'RA_TEXT_TOO_LONG'; level: 'warning'; step: 1; promptId: string; words: number }
  | { code: 'RA_PLAN_TOO_LONG'; level: 'warning'; step: 1; promptId: string; points: number }
  | { code: 'RA_MANY_PROMPTS'; level: 'warning'; step: 1; count: number }
  | { code: 'RA_NO_MODEL'; level: 'warning'; step: 1 }
  | { code: 'RA_PARTNER_TEXT_ONLY'; level: 'info'; step: 1 }
  // ── Step 2 — what we listen for ──
  | { code: 'RA_NO_NOTE'; level: 'blocker'; step: 2; promptId: string }
  | { code: 'RA_NO_FOCUS'; level: 'warning'; step: 2 }
  // ── Step 3 — rubric ──
  | { code: 'RA_RUBRIC_EMPTY'; level: 'blocker'; step: 3 }
  | { code: 'RA_CRITERION_NO_NAME'; level: 'blocker'; step: 3; criterionId: string }
  | { code: 'RA_PASS_ABOVE_MAX'; level: 'blocker'; step: 3; passScore: number; max: number }
  | { code: 'RA_LEVEL_EMPTY'; level: 'warning'; step: 3; criterionId: string }
  | { code: 'RA_RUBRIC_HIDDEN'; level: 'warning'; step: 3 }
  | { code: 'RA_MODEL_NEVER_SHOWN'; level: 'info'; step: 3 }
  // ── Step 4 — recording ──
  | { code: 'RA_OVER_CEILING'; level: 'blocker'; step: 4; promptId: string; maxSeconds: number; ceiling: number }
  | { code: 'RA_RANGE_INVALID'; level: 'blocker'; step: 4; promptId: string }
  | { code: 'RA_READ_EXCEEDS_MAX'; level: 'warning'; step: 4; promptId: string; readSeconds: number; maxSeconds: number }
  | { code: 'RA_BLIND_RETAKES'; level: 'warning'; step: 4; takes: number }
  | { code: 'RA_ONE_TAKE'; level: 'info'; step: 4 }
  | { code: 'RA_CHOOSE_NO_EFFECT'; level: 'info'; step: 4 }
  | { code: 'RA_NO_MIC_CHECK'; level: 'info'; step: 4 }
  // ── Step 5 — flow ──
  | { code: 'RA_AI_NOT_LIVE'; level: 'info'; step: 5 };

export type IssueCode = Issue['code'];

export interface IssueContext {
  /** The audio layer is on — a model reading (`read`) or the partner's line (`dialogue`). */
  audio: boolean;
}

/** Everything wrong with the document, in the prototype's order. */
export function issues(ex: ReadAloudContent, ctx: IssueContext): Issue[] {
  const out: Issue[] = [];
  const need = modeConfig(ex.mode).needs;

  // ── Step 1 ─────────────────────────────────────────────────────────────────
  if (ex.prompts.length === 0) out.push({ code: 'RA_NO_PROMPTS', level: 'blocker', step: 1 });

  for (const p of ex.prompts) {
    if (!hasMaterial(p, ex.mode)) {
      out.push({ code: 'RA_PROMPT_NO_MATERIAL', level: 'blocker', step: 1, promptId: p.id, need });
    }
    if (p.maxSeconds > LIMITS.hardMaxSeconds) {
      out.push({
        code: 'RA_OVER_CEILING',
        level: 'blocker',
        step: 4,
        promptId: p.id,
        maxSeconds: p.maxSeconds,
        ceiling: LIMITS.hardMaxSeconds,
      });
    }
    if (p.minSeconds >= p.maxSeconds) {
      out.push({ code: 'RA_RANGE_INVALID', level: 'blocker', step: 4, promptId: p.id });
    }
    if (ex.mode === 'read' && p.text.trim() !== '') {
      const read = readSeconds(p.text);
      if (read > p.maxSeconds) {
        out.push({
          code: 'RA_READ_EXCEEDS_MAX',
          level: 'warning',
          step: 4,
          promptId: p.id,
          readSeconds: read,
          maxSeconds: p.maxSeconds,
        });
      }
      const words = wordCount(p.text);
      if (words > RA_LONG_TEXT_WORDS) {
        out.push({ code: 'RA_TEXT_TOO_LONG', level: 'warning', step: 1, promptId: p.id, words });
      }
    }
    if (ex.mode === 'monologue' && planOf(p).length > RA_LONG_PLAN_POINTS) {
      out.push({
        code: 'RA_PLAN_TOO_LONG',
        level: 'warning',
        step: 1,
        promptId: p.id,
        points: planOf(p).length,
      });
    }
    if (!hasNote(p)) out.push({ code: 'RA_NO_NOTE', level: 'blocker', step: 2, promptId: p.id });
  }

  if (ex.mode === 'read' && !ex.prompts.some((p) => p.focus.length > 0)) {
    out.push({ code: 'RA_NO_FOCUS', level: 'warning', step: 2 });
  }
  if (ex.mode === 'read' && !ctx.audio) out.push({ code: 'RA_NO_MODEL', level: 'warning', step: 1 });
  if (ex.mode === 'dialogue' && !ctx.audio) {
    out.push({ code: 'RA_PARTNER_TEXT_ONLY', level: 'info', step: 1 });
  }

  // ── Step 3 ─────────────────────────────────────────────────────────────────
  if (ex.rubric.length === 0) out.push({ code: 'RA_RUBRIC_EMPTY', level: 'blocker', step: 3 });
  for (const c of ex.rubric) {
    if (c.name.trim() === '') {
      out.push({ code: 'RA_CRITERION_NO_NAME', level: 'blocker', step: 3, criterionId: c.id });
    }
    if (c.levels.some((l) => l.trim() === '')) {
      out.push({ code: 'RA_LEVEL_EMPTY', level: 'warning', step: 3, criterionId: c.id });
    }
  }
  const max = rubricMax(ex.rubric);
  if (ex.settings.passScore > max) {
    out.push({
      code: 'RA_PASS_ABOVE_MAX',
      level: 'blocker',
      step: 3,
      passScore: ex.settings.passScore,
      max,
    });
  }
  if (ex.rubric.length > 0 && !ex.rubric.some((c) => c.studentVisible)) {
    out.push({ code: 'RA_RUBRIC_HIDDEN', level: 'warning', step: 3 });
  }

  // ── Step 4 ─────────────────────────────────────────────────────────────────
  const r = ex.recording;
  if (r.takes > 1 && !r.listenBack) {
    out.push({ code: 'RA_BLIND_RETAKES', level: 'warning', step: 4, takes: r.takes });
  }
  // Defensible for `dialogue`, where an unrehearsed reply is the point (DECISIONS §1).
  if (r.takes === 1 && ex.mode !== 'dialogue') out.push({ code: 'RA_ONE_TAKE', level: 'info', step: 4 });
  if (r.chooseBest && r.takes === 1) out.push({ code: 'RA_CHOOSE_NO_EFFECT', level: 'info', step: 4 });
  if (!r.micCheck) out.push({ code: 'RA_NO_MIC_CHECK', level: 'info', step: 4 });

  if (ex.prompts.length > RA_MANY_PROMPTS) {
    out.push({ code: 'RA_MANY_PROMPTS', level: 'warning', step: 1, count: ex.prompts.length });
  }

  // ── Step 5 ─────────────────────────────────────────────────────────────────
  if (ex.review.aiStage) out.push({ code: 'RA_AI_NOT_LIVE', level: 'info', step: 5 });

  if (ex.settings.showModel === 'never' && ctx.audio) {
    out.push({ code: 'RA_MODEL_NEVER_SHOWN', level: 'info', step: 3 });
  }

  return out;
}

/** Whether the exercise may be published or assigned — the gate's and the preflight's question. */
export function isReady(ex: ReadAloudContent, ctx: IssueContext): boolean {
  return !issues(ex, ctx).some((i) => i.level === 'blocker');
}

export function blockers(ex: ReadAloudContent, ctx: IssueContext): Issue[] {
  return issues(ex, ctx).filter((i) => i.level === 'blocker');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/**
 * The rail dot for a step (`raStepState`): blockers first, then warnings, then `empty` — step 1
 * without a single prompt carrying its material, step 2 without a single note — then `ok`. Info
 * does not colour the dot.
 */
export function stepState(ex: ReadAloudContent, step: IssueStep, ctx: IssueContext): StepState {
  const own = issues(ex, ctx).filter((i) => i.step === step);
  const errs = own.filter((i) => i.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (own.some((i) => i.level === 'warning')) return { s: 'warn', errs: 0 };
  const empty =
    (step === 1 && !ex.prompts.some((p) => hasMaterial(p, ex.mode))) ||
    (step === 2 && !ex.prompts.some(hasNote));
  return { s: empty ? 'empty' : 'ok', errs: 0 };
}
