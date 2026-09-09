// What a student is allowed to see — IMPLEMENTATION.md's "Security" rule: "the example
// answer, the level descriptors and the point keywords must never reach the student
// client before the teacher has graded. Send the checklist point `text` (the student
// needs it), never `keywords`."
//
// Unlike the other templates' projections, this one takes **both** columns rather than
// the assembled document. The reason is a single setting: with `showRubric: 'always'`
// the level descriptors are a writing guide and have to reach the student *before* the
// mark, but they live in `expected_answers` (persistence.ts). A projection written from
// `content` alone would compile, pass every test that does not know about the setting,
// and silently drop the feature — plan 50 §5 records exactly that trap.
//
// Everything else the answer key holds is unreachable from here by construction: this
// function never assembles a `WritingTask`, so the model answer and the point keywords
// are not values it holds and forgets to strip. It reads `levels`, and nothing else,
// out of the key.

import { rubricMax } from './analysis.js';
import type {
  Image,
  Letter,
  Mode,
  RevisionPolicy,
  ShowModelPolicy,
  ShowRubricPolicy,
} from './model.js';
import { modeConfig } from './model.js';
import type { PersistedContent } from './persistence.js';
import { readAnswers, readContent } from './persistence.js';

/** One must-cover point as the runner receives it: the checklist item, never its keywords. */
export interface ProjectedPoint {
  id: string;
  text: string;
  /** Optional points are shown but do not count towards a pass. */
  required: boolean;
}

/**
 * One criterion as the runner receives it. Present only when `showRubric: 'always'`, and
 * then whole — a criterion without its descriptors is a name and a number, which is what
 * the setting exists to avoid.
 */
export interface ProjectedCriterion {
  id: string;
  name: string;
  desc: string;
  weight: 1 | 2;
  levels: readonly [string, string, string, string];
}

/**
 * The settings that change what the student sees or may do.
 *
 * `aiStage`, `ai.*`, `aiVisibility` and `aiSelfLimit` are deliberately absent: plan 50
 * §3.5 keeps the AI stage unbuilt in this build, and a runner handed the switches would
 * grow the button that goes with them. When the stage is built (plan 48), this is where
 * they arrive.
 */
export interface ProjectedSettings {
  minWords: number;
  maxWords: number;
  /** Minutes, 0 = off. */
  timer: number;
  blockPaste: boolean;
  autosave: boolean;
  showWordCount: boolean;
  showPlan: boolean;
  showPhrases: boolean;
  /** Carried so the runner knows whether a rubric is coming at all, not only this one. */
  showRubric: ShowRubricPolicy;
  showModel: ShowModelPolicy;
  /** Rubric points needed to pass, out of `rubricMax`. Shown, not secret. */
  passScore: number;
  /** Decides whether a failed attempt may be rewritten (README's state machine). */
  revision: RevisionPolicy;
}

export interface StudentProjection {
  mode: Mode;
  instruction: string;
  prompt: string;
  /** `retell` only — the text being retold. */
  source?: string;
  /** `picture` only. */
  image?: Image;
  /** `letter` only. */
  letter?: Letter;
  points: ProjectedPoint[];
  phrases: string[];
  /** Only when `showRubric: 'always'`. */
  rubric?: ProjectedCriterion[];
  /**
   * `Σ 3 × weight` over the full rubric. Sent whatever `showRubric` says, because the
   * graded card reads `N / M poeng` even when it lists no criteria.
   */
  rubricMax: number;
  settings: ProjectedSettings;
}

/**
 * Build the student's view of the task.
 *
 * Takes the two persisted columns as they come out of the database — `unknown`, possibly
 * predating the current shape — because the callers (exercise-engine's `start-attempt`,
 * content-service's student-safe content) have exactly that and nothing more. Call it on
 * the server only: it is the thing that takes the key away.
 */
export function toStudentProjection(content: unknown, expectedAnswers: unknown): StudentProjection {
  const task = readContent(content);
  const needs = modeConfig(task.mode).needs;
  const s = task.settings;

  return {
    mode: task.mode,
    instruction: task.instruction,
    prompt: task.prompt,
    // Only the material this mode actually renders. An author who wrote a source text and
    // then switched to `essay` keeps it in the record (README: switching mode does not
    // clear the text fields) — but the student is not shown a text the task never mentions.
    ...(needs === 'source' ? { source: task.source } : {}),
    ...(needs === 'image' ? { image: task.image } : {}),
    ...(needs === 'letter' ? { letter: task.letter } : {}),
    points: task.points
      .filter((point) => point.text.trim() !== '')
      .map((point) => ({ id: point.id, text: point.text, required: point.required })),
    phrases: task.phrases,
    ...(s.showRubric === 'always' ? { rubric: projectedRubric(task, expectedAnswers) } : {}),
    rubricMax: rubricMax(task),
    settings: {
      minWords: s.minWords,
      maxWords: s.maxWords,
      timer: s.timer,
      blockPaste: s.blockPaste,
      autosave: s.autosave,
      showWordCount: s.showWordCount,
      showPlan: s.showPlan,
      showPhrases: s.showPhrases,
      showRubric: s.showRubric,
      showModel: s.showModel,
      passScore: s.passScore,
      revision: s.revision,
    },
  };
}

/**
 * The rubric with its descriptors, for `showRubric: 'always'` only.
 *
 * The descriptors are the one part of the answer key this module may touch, and the
 * lookup is by criterion id — reordering the rubric after a document was written cannot
 * shuffle a descriptor onto the wrong criterion.
 */
function projectedRubric(
  task: PersistedContent,
  expectedAnswers: unknown,
): ProjectedCriterion[] {
  const answers = readAnswers(expectedAnswers);

  return task.rubric.map((c) => ({
    id: c.id,
    name: c.name,
    desc: c.desc,
    weight: c.weight,
    levels: answers.rubric[c.id]?.levels ?? ['', '', '', ''],
  }));
}
