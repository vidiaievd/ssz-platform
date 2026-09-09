// The grader — README "Verdict (saGrade)" and plan 51 §3.4.
//
// Two rules from IMPLEMENTATION.md that outlive any particular matcher:
//
//   1. **The verdict is derived from element coverage, not from a single score.** The
//      breakdown *is* the feature: the student is told which of the things the answer
//      had to say were said, and a teacher reading the queue sees the same list. A
//      similarity percentage would be cheaper and would say nothing.
//   2. **`modelPasses` must stay true.** Whatever grades students also grades the
//      author's own model answer, and a failure there is a blocker (issues.ts) — if the
//      author's answer does not pass the key, no student's will.
//
// Anything producing `QuestionResult` drops in here — a stemmer, a lemmatiser, an
// embedding similarity. The shape is the contract the runner, the builder and the
// review queue all read.

import { hasAnchor, words as splitWords } from './matching.js';
import type { KeyElement, Question, Settings, ShortAnswerContent } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

/** What the phrase match concluded about one answer. */
export type Verdict = 'pass' | 'partial' | 'fail';

/** One element's outcome. `anchor` is the phrase that matched — teacher-facing only. */
export interface ElementHit {
  id: string;
  label: string;
  required: boolean;
  /** The anchor that matched, or `null`. Never projected to the student (projection.ts). */
  anchor: string | null;
}

export interface QuestionResult {
  hits: ElementHit[];
  /** Required elements with a hit. */
  covered: number;
  /** How many of them a pass needs. */
  need: number;
  /** Required elements in total — the `M` in `N av M punkter dekket`. */
  total: number;
  verdict: Verdict;
  /** `0 < words < minWords`. Caps a pass at `partial`; never fails an answer on its own. */
  tooShort: boolean;
  /** Word count of the answer. */
  words: number;
}

/**
 * Elements that can actually grade: both a label and at least one non-empty anchor.
 *
 * A half-written element is persisted exactly as the author left it (plan 51 §6.4) —
 * they are allowed to walk away mid-sentence — but it never counts for or against a
 * student. Filtering here rather than at save time is what makes that possible.
 */
export function usableElements(q: Question): KeyElement[] {
  return (q.elements ?? []).filter(
    (e) => e.label.trim() !== '' && e.anchors.some((a) => a.trim() !== ''),
  );
}

/** Grade one answer against one question's key. Pure and synchronous, by contract. */
export function grade(q: Question, text: string, settings: Settings = DEFAULT_SETTINGS): QuestionResult {
  const answerWords = splitWords(text);
  const usable = usableElements(q);
  const required = usable.filter((e) => e.required);

  const hits: ElementHit[] = usable.map((e) => ({
    id: e.id,
    label: e.label,
    required: e.required,
    anchor: e.anchors.find((a) => a.trim() !== '' && hasAnchor(answerWords, a, settings.typos)) ?? null,
  }));

  const covered = hits.filter((h) => h.required && h.anchor !== null).length;
  const need = settings.passRule === 'all' ? required.length : Math.min(settings.passN, required.length);
  const tooShort = answerWords.length > 0 && answerWords.length < settings.minWords;

  // `required.length > 0` is README's rule verbatim: a key made entirely of optional
  // elements can never pass. That is not a trap for authors — the same key fails
  // `modelPasses`, which issues.ts raises as a step-2 blocker before it can be assigned.
  let verdict: Verdict = 'fail';
  if (required.length > 0 && covered >= need && !tooShort) verdict = 'pass';
  else if (covered > 0) verdict = 'partial';

  return { hits, covered, need, total: required.length, verdict, tooShort, words: answerWords.length };
}

/**
 * Does the author's own model answer pass their own key?
 *
 * The single most useful validation in the builder, and the one the step-2 coverage
 * meter counts. A question with no model answer written yet is not passing — there is
 * nothing to run.
 */
export function modelPasses(q: Question, settings: Settings = DEFAULT_SETTINGS): boolean {
  return q.model.trim() !== '' && grade(q, q.model, settings).verdict === 'pass';
}

/** Questions complete enough to answer: a prompt, a model answer, and a usable key. */
export function gradeableQuestions(ex: ShortAnswerContent): Question[] {
  return ex.questions.filter(
    (q) => q.prompt.trim() !== '' && q.model.trim() !== '' && usableElements(q).length > 0,
  );
}

/** Step 2's coverage strip: how many model answers pass, and how many phrases exist. */
export interface Coverage {
  /** Questions whose model answer passes its own key. */
  done: number;
  total: number;
  /** Anchor phrases across the whole document. */
  anchors: number;
}

export function coverage(ex: ShortAnswerContent): Coverage {
  return {
    done: ex.questions.filter((q) => modelPasses(q, ex.settings)).length,
    total: ex.questions.length,
    anchors: ex.questions.reduce(
      (sum, q) =>
        sum + usableElements(q).reduce((n, e) => n + e.anchors.filter((a) => a.trim() !== '').length, 0),
      0,
    ),
  };
}

// ── The attempt ──────────────────────────────────────────────────────────────

/** One answered question, as the attempt carries it. */
export interface SubmittedAnswer {
  questionId: string;
  text: string;
}

/** One graded question, as the validator writes it into `details.items` for the queue. */
export interface GradedAnswer extends SubmittedAnswer {
  /** Absent when the attempt names a question the document no longer has. */
  question: Question | null;
  result: QuestionResult | null;
}

/**
 * What the whole attempt comes to.
 *
 * `score` is a percentage because the percentage is a contract of the wider system, not
 * a detail of this type: the SRS consumer routes `score < 60` into `AGAIN`. It is
 * computed over *elements*, not over questions, so a three-question attempt that half-
 * covered every question does not read the same as one that aced two and missed one.
 */
export interface AttemptOutcome {
  answers: GradedAnswer[];
  /** Required elements covered across every answered question. */
  covered: number;
  /** Required elements across every answered question. */
  total: number;
  /** `round(covered / total × 100)`; 100 when there is nothing to cover. */
  score: number;
  /** Every answered question passed. */
  correct: boolean;
  /** Derived from `settings.teacherReview` — plan 51 §3.4. */
  requiresReview: boolean;
}

export function gradeAttempt(ex: ShortAnswerContent, answers: readonly SubmittedAnswer[]): AttemptOutcome {
  const graded: GradedAnswer[] = answers.map((a) => {
    const question = ex.questions.find((q) => q.id === a.questionId) ?? null;
    return {
      questionId: a.questionId,
      text: a.text,
      question,
      result: question ? grade(question, a.text, ex.settings) : null,
    };
  });

  let covered = 0;
  let total = 0;
  for (const a of graded) {
    if (!a.result) continue;
    covered += a.result.covered;
    total += a.result.total;
  }

  const results = graded.filter((a) => a.result !== null);
  const correct = results.length > 0 && results.every((a) => a.result!.verdict === 'pass');

  return {
    answers: graded,
    covered,
    total,
    score: total === 0 ? 100 : Math.round((covered / total) * 100),
    correct,
    requiresReview: needsTeacher(ex.settings, graded),
  };
}

function needsTeacher(settings: Settings, graded: readonly GradedAnswer[]): boolean {
  if (settings.teacherReview === 'none') return false;
  if (settings.teacherReview === 'all') return true;
  // 'flagged' — anything the phrase match did not simply pass, including a question the
  // document no longer holds: an answer nothing can grade is exactly what a person is for.
  return graded.some((a) => a.result === null || a.result.verdict !== 'pass');
}
