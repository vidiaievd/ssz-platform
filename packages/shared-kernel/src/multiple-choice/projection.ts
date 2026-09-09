// What a student is allowed to see before answering.
//
// For this template that is a short list, and the shortness is the point: the question,
// the options as text, and the settings that change what the runner may draw. Which
// option is right, the rule behind it and every rebuttal live in the key column and
// arrive one pick at a time, from `judge` (grading.ts) — never here.
//
// Three things this file is responsible for beyond omission:
//
//   1. **Empty options never reach the student**, and the letters renumber accordingly.
//      They are persisted as authored (persistence.ts) and dropped here.
//   2. **The order is decided server-side** (plan 53 §3.4). A runner that shuffled locally
//      would be shuffling something the network tab had already shown in order, and would
//      number the options differently from the server that computed the 50/50.
//   3. **`shuffle` and `shuffleQuestions` are applied, not shipped.** A client cannot act
//      on them; it can only contradict what it was sent.
//
// Unlike `short_answer` and `writing_task`, this projection needs the content column
// alone: no setting reveals part of the key early, so there is nothing for a second
// argument to carry.

import type { Layout, QuestionKind, RetryPolicy, Settings } from './model.js';
import { kindConfig } from './model.js';
import { readContent } from './persistence.js';
import { identityShuffle, ordered } from './shuffle.js';

export interface ProjectedOption {
  id: string;
  text: string;
}

export interface ProjectedQuestion {
  id: string;
  kind: QuestionKind;
  stem: string;
  /** `reading`, `grammar`, `vocab`. A `listening` transcript is the author's, not the student's. */
  context?: string;
  options: ProjectedOption[];
}

/**
 * The settings that change what the student sees or may do.
 *
 * `retry` is carried even though the verdict already reports `attemptsLeft`: the runner
 * decides *before* the first check whether this is a one-shot question, and it reveals
 * nothing — knowing that a second try exists is not knowing the answer.
 */
export interface ProjectedSettings {
  letters: boolean;
  layout: Layout;
  instant: boolean;
  retry: RetryPolicy;
  eliminate: boolean;
  progress: boolean;
}

export interface StudentProjection {
  instruction: string;
  questions: ProjectedQuestion[];
  settings: ProjectedSettings;
}

/** Deterministic when nothing is injected; the server supplies the per-attempt seed. */
export type Shuffle = <T>(items: readonly T[]) => T[];

/**
 * Project the whole document for one student.
 *
 * `shuffle` is injected rather than called from here so the server can seed it per attempt
 * and the builder preview can reshuffle on demand — and so this function stays pure and
 * testable, which a `Math.random` inside would not be.
 */
export function toStudentProjection(content: unknown, shuffle: Shuffle = identityShuffle): StudentProjection {
  const ex = readContent(content);
  const s = ex.settings;

  // A question with no stem or fewer than two written options is not answerable and has
  // no place in the runner. The key-side condition — that a non-empty option is marked
  // correct — cannot be checked from here by design; the server's publish preflight blocks
  // a document that fails it, and `gradeAttempt` is the check that has the key to run.
  const questions = ex.questions
    .map((q) => ({ ...q, options: q.options.filter((o) => o.text.trim() !== '') }))
    .filter((q) => q.stem.trim() !== '' && q.options.length >= 2)
    .map((q): ProjectedQuestion => {
      const options = s.shuffle ? ordered(q.options, shuffle) : ordered(q.options, identityShuffle);
      return {
        id: q.id,
        kind: q.kind,
        stem: q.stem,
        ...(kindConfig(q.kind).showsPassage && q.context.trim() !== '' ? { context: q.context } : {}),
        options: options.map((o) => ({ id: o.id, text: o.text })),
      };
    });

  return {
    instruction: ex.instruction,
    questions: s.shuffleQuestions ? shuffle(questions) : questions,
    settings: projectSettings(s),
  };
}

export function projectSettings(s: Settings): ProjectedSettings {
  return {
    letters: s.letters,
    layout: s.layout,
    instant: s.instant,
    retry: s.retry,
    eliminate: s.eliminate,
    progress: s.progress,
  };
}
