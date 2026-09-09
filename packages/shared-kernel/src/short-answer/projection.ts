// What a student is allowed to see — IMPLEMENTATION.md's rule: "Ship the question
// without `elements`, `model` and `why`; return the verdict, the element labels with
// hit flags, and the model answer only when `showModel` allows it."
//
// The anchors are not merely sensitive here, they are *the answer written in the words
// the student is being asked to find*. So this module never assembles a `Question`: the
// key is not a value it holds and forgets to strip. It reads `model` — and nothing else
// — out of the key, and only under `showModel: 'always'`.
//
// Two traps this file exists to avoid, both found by plan 50:
//
//   1. **`showModel: 'always'` is the one case where part of the key must reach the
//      student early** (self-study mode). A projection written from `content` alone
//      would compile, pass every test that does not know about the setting, and
//      silently drop the feature. Hence both columns as arguments.
//   2. **A projection may be run twice.** The content-service hands the runner a
//      document whose `expectedAnswers` it has already nulled out; `start-attempt` then
//      projects again. The second run must produce a usable question set, not throw and
//      not resurrect anything.
//
// Call it on the server only: it is the thing that takes the key away.

import type { PassRule, QuestionKind, Settings, ShowModelPolicy } from './model.js';
import { kindConfig } from './model.js';
import { readAnswers, readContent } from './persistence.js';

/** One question as the runner receives it. */
export interface ProjectedQuestion {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** `reading` only. A `listening` transcript is the author's, not the student's. */
  passage?: string;
  /** Only under `showModel: 'always'`. Otherwise it arrives with the verdict, or never. */
  model?: string;
}

/**
 * The settings that change what the student sees or may do.
 *
 * `typos`, `passRule`, `passN` and `minWords` are carried even though the client does
 * not grade: the runner renders `N av M punkter dekket` and the too-short line from the
 * server's result, and a client that knows the rule can label them without a second
 * round trip. They reveal nothing — knowing that two elements are needed does not tell
 * you what they are.
 *
 * `aiStage` and `aiGrammar` are carried because the result card's placeholder is part
 * of the design; nothing behind them is called (plan 51 §3.6).
 */
export interface ProjectedSettings {
  passRule: PassRule;
  passN: number;
  minWords: number;
  showBreakdown: boolean;
  showModel: ShowModelPolicy;
  aiStage: boolean;
  aiGrammar: boolean;
  /** The runner's routing line reads from this; the student is told who sees the answer. */
  teacherReview: Settings['teacherReview'];
  progress: boolean;
}

export interface StudentProjection {
  instruction: string;
  questions: ProjectedQuestion[];
  settings: ProjectedSettings;
}

export function toStudentProjection(content: unknown, expectedAnswers: unknown): StudentProjection {
  const ex = readContent(content);
  const s = ex.settings;
  const answers = s.showModel === 'always' ? readAnswers(expectedAnswers) : null;

  return {
    instruction: ex.instruction,
    // A question with no prompt is not answerable and has no place in the runner. The
    // key-side conditions (a model answer, a usable element) cannot be checked from
    // here by design — the server's preflight blocks publishing without them, and
    // `gradeableQuestions` is the check that has the key to run.
    questions: ex.questions
      .filter((q) => q.prompt.trim() !== '')
      .map((q) => {
        const model = answers?.questions[q.id]?.model ?? '';
        return {
          id: q.id,
          kind: q.kind,
          prompt: q.prompt,
          ...(kindConfig(q.kind).showsPassage ? { passage: q.passage } : {}),
          ...(model.trim() !== '' ? { model } : {}),
        };
      }),
    settings: {
      passRule: s.passRule,
      passN: s.passN,
      minWords: s.minWords,
      showBreakdown: s.showBreakdown,
      showModel: s.showModel,
      aiStage: s.aiStage,
      aiGrammar: s.aiGrammar,
      teacherReview: s.teacherReview,
      progress: s.progress,
    },
  };
}

// ── The result ──────────────────────────────────────────────────────────────

/** One element in the student's breakdown: the teacher's label and whether it was said. */
export interface ProjectedHit {
  id: string;
  label: string;
  required: boolean;
  hit: boolean;
}

/**
 * What comes back when a question is answered — README "Result card", in its order.
 *
 * The anchor that matched is dropped here, not hidden by the component. It is the one
 * field of `ElementHit` that names the phrasing the key looks for, so a breakdown that
 * carried it would hand the student the key one question at a time. The teacher's queue
 * reads the unprojected result and does see it.
 */
export interface StudentResult {
  questionId: string;
  verdict: 'pass' | 'partial' | 'fail';
  covered: number;
  total: number;
  tooShort: boolean;
  /** Empty when `showBreakdown` is off. */
  hits: ProjectedHit[];
  /** The teacher's explanation. Always shown once the answer is in. */
  why: string;
  /** Present under `showModel: 'always' | 'onClose'`; absent under `'never'`. */
  model?: string;
}

/** Inputs `toStudentResult` needs from the graded side, without importing the grader. */
export interface GradedQuestion {
  questionId: string;
  verdict: 'pass' | 'partial' | 'fail';
  covered: number;
  total: number;
  tooShort: boolean;
  hits: readonly { id: string; label: string; required: boolean; anchor: string | null }[];
  why: string;
  model: string;
}

export function toStudentResult(graded: GradedQuestion, settings: ProjectedSettings): StudentResult {
  return {
    questionId: graded.questionId,
    verdict: graded.verdict,
    covered: graded.covered,
    total: graded.total,
    tooShort: graded.tooShort,
    hits: settings.showBreakdown
      ? graded.hits.map((h) => ({ id: h.id, label: h.label, required: h.required, hit: h.anchor !== null }))
      : [],
    why: graded.why,
    ...(settings.showModel !== 'never' && graded.model.trim() !== '' ? { model: graded.model } : {}),
  };
}
