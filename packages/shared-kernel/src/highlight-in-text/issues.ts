// The validation engine for `highlight_in_text` — SPEC_data_model §5.
//
// One list drives the rail dots, the inline messages in each step and the gate; the
// content-service publish preflight reads the same function (AC-X1, AC-X2). Blockers make the
// exercise unplayable or unfair; warnings never stop it.
//
// Issues carry a code and the parameters a message needs, never the message: the teacher UI
// is translated into four languages. Every issue about one question names it by id — the
// prototype counted ("2 questions have no wording"), which cannot be drawn on the tab it
// belongs to (plan 67 §5, deviation 11).
//
// One code is not in the handoff's table: `HT_SPAN_OFF_TOKENS` (plan 67, decision Q3-A).
// The server does not re-anchor on save; instead a span that does not start and end on token
// edges of the current text blocks publication. A client on this build never produces one —
// it is the guard against a client that tokenized differently.

import { isOnTokens, paragraphOfTokens, toTokenRun } from './coordinates.js';
import type { CeilingCause } from './derive.js';
import { ceilingCause, markedWords, normalize, overlaps, readyQuestions, tokensOf } from './derive.js';
import type { HighlightInTextContent } from './model.js';
import { HT_DENSITY_HIGH, HT_FEW_SPANS, HT_MAX_Q, HT_TEXT_LONG, HT_TEXT_SHORT } from './model.js';

export type IssueLevel = 'blocker' | 'warning';

/** Which builder step owns the fix. Rail dots and the gate's jump links both use it. */
export type IssueStep = 1 | 2 | 3 | 4;

export type Issue =
  // ── Step 1 — the text ──
  | { code: 'HT_NO_TEXT'; level: 'blocker'; step: 1 }
  | { code: 'HT_NO_TITLE'; level: 'blocker'; step: 1 }
  | { code: 'HT_TEXT_SHORT'; level: 'warning'; step: 1; words: number }
  | { code: 'HT_TEXT_LONG'; level: 'warning'; step: 1; words: number }
  // ── Step 2 — questions and marks ──
  | { code: 'HT_ORPHANED_MARKS'; level: 'blocker'; step: 2; count: number }
  | { code: 'HT_NO_QUESTIONS'; level: 'blocker'; step: 2 }
  | { code: 'HT_QUESTION_NO_PROMPT'; level: 'blocker'; step: 2; questionId: string }
  | { code: 'HT_QUESTION_NO_SPANS'; level: 'blocker'; step: 2; questionId: string }
  | { code: 'HT_SPANS_OVERLAP'; level: 'blocker'; step: 2; questionId: string }
  | { code: 'HT_SPAN_OFF_TOKENS'; level: 'blocker'; step: 2; questionId: string; spanId: string }
  | { code: 'HT_TOO_FEW_SPANS'; level: 'warning'; step: 2; questionId: string; count: number }
  | { code: 'HT_DENSITY_HIGH'; level: 'warning'; step: 2; questionId: string; share: number }
  | { code: 'HT_UNIT_MISMATCH'; level: 'warning'; step: 2; questionId: string }
  | { code: 'HT_DUPLICATE_PROMPT'; level: 'warning'; step: 2; questionId: string }
  | { code: 'HT_TOO_MANY_QUESTIONS'; level: 'warning'; step: 2; count: number }
  // ── Step 3 — feedback ──
  | { code: 'HT_NO_MISS_HINT'; level: 'blocker'; step: 3; questionId: string }
  | { code: 'HT_NO_FP_HINT'; level: 'warning'; step: 3; questionId: string }
  // ── Step 4 — difficulty ──
  | { code: 'HT_PENALTY_OFF'; level: 'warning'; step: 4 }
  | { code: 'HT_COUNT_SHOWN'; level: 'warning'; step: 4 }
  | { code: 'HT_ONE_SHOT_REVEAL'; level: 'warning'; step: 4 };

export type IssueCode = Issue['code'];

/** Everything wrong with the document, in authoring order: step 1, then 2, 3, 4. */
export function issues(ex: HighlightInTextContent): Issue[] {
  const out: Issue[] = [];
  const tokens = tokensOf(ex);
  const words = tokens.length;

  // ── Step 1 ────────────────────────────────────────────────────────────────
  if (ex.text.trim() === '') out.push({ code: 'HT_NO_TEXT', level: 'blocker', step: 1 });
  if (ex.title.trim() === '') out.push({ code: 'HT_NO_TITLE', level: 'blocker', step: 1 });
  if (words > 0 && words < HT_TEXT_SHORT) out.push({ code: 'HT_TEXT_SHORT', level: 'warning', step: 1, words });
  if (words > HT_TEXT_LONG) out.push({ code: 'HT_TEXT_LONG', level: 'warning', step: 1, words });

  // ── Step 2 ────────────────────────────────────────────────────────────────
  if (ex.orphans.length > 0) {
    out.push({ code: 'HT_ORPHANED_MARKS', level: 'blocker', step: 2, count: ex.orphans.length });
  }
  if (ex.questions.length === 0) out.push({ code: 'HT_NO_QUESTIONS', level: 'blocker', step: 2 });

  const paragraphOf = paragraphOfTokens(ex.text, tokens);
  const prompts = new Set<string>();
  for (const q of ex.questions) {
    const questionId = q.id;
    const prompt = q.prompt.trim();
    if (prompt === '') out.push({ code: 'HT_QUESTION_NO_PROMPT', level: 'blocker', step: 2, questionId });
    else if (q.spans.length === 0) out.push({ code: 'HT_QUESTION_NO_SPANS', level: 'blocker', step: 2, questionId });

    if (overlaps(q)) out.push({ code: 'HT_SPANS_OVERLAP', level: 'blocker', step: 2, questionId });

    for (const span of q.spans) {
      const run = toTokenRun(tokens, span);
      const onEdges = run !== null && isOnTokens(tokens, span) && paragraphOf[run.t0] === paragraphOf[run.t1];
      if (!onEdges) {
        out.push({ code: 'HT_SPAN_OFF_TOKENS', level: 'blocker', step: 2, questionId, spanId: span.id });
      }
    }

    if (q.spans.length > 0 && q.spans.length < HT_FEW_SPANS) {
      out.push({ code: 'HT_TOO_FEW_SPANS', level: 'warning', step: 2, questionId, count: q.spans.length });
    }
    if (words > 0) {
      const share = markedWords(tokens, q) / words;
      if (share > HT_DENSITY_HIGH) out.push({ code: 'HT_DENSITY_HIGH', level: 'warning', step: 2, questionId, share });
    }
    if (q.unit === 'word') {
      const phrase = q.spans.some((s) => {
        const r = toTokenRun(tokens, s);
        return r !== null && r.t1 > r.t0;
      });
      if (phrase) out.push({ code: 'HT_UNIT_MISMATCH', level: 'warning', step: 2, questionId });
    }
    // The second occurrence is flagged — the one the author most likely meant to change.
    if (prompt !== '') {
      const key = normalize(prompt);
      if (prompts.has(key)) out.push({ code: 'HT_DUPLICATE_PROMPT', level: 'warning', step: 2, questionId });
      prompts.add(key);
    }
  }
  if (ex.questions.length > HT_MAX_Q) {
    out.push({ code: 'HT_TOO_MANY_QUESTIONS', level: 'warning', step: 2, count: ex.questions.length });
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  // Only on a question with spans (SPEC §5): asking why a mark was missed where nothing can
  // be missed is noise. That leaves step 3 empty on a blank draft — decision Q6-A of plan 67.
  for (const q of ex.questions) {
    if (q.spans.length === 0) continue;
    if (q.missHint.trim() === '') out.push({ code: 'HT_NO_MISS_HINT', level: 'blocker', step: 3, questionId: q.id });
    if (q.fpHint.trim() === '') out.push({ code: 'HT_NO_FP_HINT', level: 'warning', step: 3, questionId: q.id });
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  const cause: CeilingCause | null = ceilingCause(ex);
  if (cause === 'penalty' || cause === 'both') out.push({ code: 'HT_PENALTY_OFF', level: 'warning', step: 4 });
  if (cause === 'count' || cause === 'both') out.push({ code: 'HT_COUNT_SHOWN', level: 'warning', step: 4 });
  if (ex.settings.attempts === 1 && ex.settings.revealKey) {
    out.push({ code: 'HT_ONE_SHOT_REVEAL', level: 'warning', step: 4 });
  }

  return out;
}

/** Whether the exercise may be published or assigned — the gate's and the preflight's question. */
export function isReady(ex: HighlightInTextContent): boolean {
  return !issues(ex).some((i) => i.level === 'blocker');
}

export function blockers(ex: HighlightInTextContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'blocker');
}

export function warnings(ex: HighlightInTextContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'warning');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/**
 * The rail dot for a step — `err` with a count, `warn` amber, `empty` grey, `ok` green.
 *
 * Unlike `sort_into_buckets`, blockers come **first**: this handoff asks for the counts on a
 * blank draft (AC-A1, BEHAVIOR §1), and steps 1 and 2 show them from the start. Step 3 has
 * nothing to block until a question has a mark, so a blank draft shows it `empty` (Q6-A).
 *
 *   step 2 — empty while no question is ready (only reachable without blockers: never, in
 *            practice — kept to mirror the prototype);
 *   step 3 — empty while no question has a mark;
 *   steps 1 and 4 — never empty.
 */
export function stepState(ex: HighlightInTextContent, step: IssueStep): StepState {
  const own = issues(ex).filter((i) => i.step === step);
  const errs = own.filter((i) => i.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (own.length > 0) return { s: 'warn', errs: 0 };
  if (step === 2 && readyQuestions(ex).length === 0) return { s: 'empty', errs: 0 };
  if (step === 3 && ex.questions.every((q) => q.spans.length === 0)) return { s: 'empty', errs: 0 };
  return { s: 'ok', errs: 0 };
}
