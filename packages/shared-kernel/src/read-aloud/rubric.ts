// The arithmetic behind a teacher's verdict on a `read_aloud` submission (plan 70 §3.6, Q1-A).
//
// A person marks every recording 0–3 per criterion. The marks travel as one flat record keyed
// `"<itemId>:<criterionId>"` — exactly the address the handoff names for a criterion of a
// prompt — so the attempt's `rubric_marks` column, the reviewer's draft store and the decision
// request keep the shape `writing_task` gave them. What a set of marks comes to is computed by
// `writing-task/verdict.ts`, once per prompt, against the snapshot taken when the work was
// queued: the same function, the same rounding, the same threshold in rubric points.
//
// Q1-A, decided 05.10: a prompt passes when its own points reach `passScore` — the threshold the
// author set for one recording — and the submission passes when every prompt does. The score
// the attempt carries is the percentage of the points summed over prompts; it exists for
// progress and the SRS, which read percentages. Nobody is shown it as «the mark»: the learner
// and the teacher see each prompt's points, and the memory gets each prompt's verdict.
//
// Nothing here decides a mark. Marks come from a person; this only adds them up.

import {
  readRubricMarks,
  readRubricSnapshot,
  scoreRubric,
  toPercent,
  type RubricMarks,
  type RubricOutcome,
  type SnapshotCriterion,
} from '../writing-task/verdict.js';
import type { Mode, ReadAloudContent } from './model.js';
import { isMode } from './model.js';

/** One criterion as it stood when the submission was queued, with who may see it. */
export interface SpeakingCriterion extends SnapshotCriterion {
  studentVisible: boolean;
}

/** The rubric and its per-recording threshold, frozen when the submission reached the queue. */
export interface SpeakingSnapshot {
  criteria: SpeakingCriterion[];
  /** In rubric points, out of `Σ 3 × weight` — for one recording. */
  passScore: number;
  /**
   * The task the recordings answer, as it stood when they were queued. The verdict reads it to
   * decide how strong the evidence is (Q6-A: reading a given text aloud is one step weaker), and
   * it is frozen with the rubric so that an author switching the mode later cannot restate it.
   * Null for a snapshot that predates the field.
   */
  mode: Mode | null;
}

export function markKey(itemId: string, criterionId: string): string {
  return `${itemId}:${criterionId}`;
}

export function parseMarkKey(key: string): { itemId: string; criterionId: string } | null {
  const at = key.indexOf(':');
  if (at <= 0 || at === key.length - 1) return null;
  return { itemId: key.slice(0, at), criterionId: key.slice(at + 1) };
}

/** The snapshot to store when a submission is queued. Descriptors included — the queue draws them. */
export function snapshotOf(ex: Pick<ReadAloudContent, 'mode' | 'rubric' | 'settings'>): SpeakingSnapshot {
  return {
    criteria: ex.rubric.map((c) => ({
      id: c.id,
      name: c.name,
      desc: c.desc,
      weight: c.weight,
      levels: c.levels,
      studentVisible: c.studentVisible,
    })),
    passScore: ex.settings.passScore,
    mode: ex.mode,
  };
}

/** Read a snapshot back out of a JSON column; `null` for anything that is not a usable rubric. */
export function readSpeakingSnapshot(value: unknown): SpeakingSnapshot | null {
  const base = readRubricSnapshot(value);
  if (base === null) return null;
  const raw = (value as { criteria: unknown[] }).criteria;
  const visible = new Map<string, boolean>();
  for (const c of raw) {
    if (typeof c === 'object' && c !== null) {
      const { id, studentVisible } = c as { id?: unknown; studentVisible?: unknown };
      if (typeof id === 'string') visible.set(id, studentVisible !== false);
    }
  }
  const mode = (value as { mode?: unknown }).mode;
  return {
    criteria: base.criteria.map((c) => ({ ...c, studentVisible: visible.get(c.id) ?? true })),
    passScore: base.passScore,
    mode: isMode(mode) ? mode : null,
  };
}

/** Marks off a request or a column: whole numbers 0–3 under well-formed keys, the rest dropped. */
export function readMarks(value: unknown): Record<string, number> {
  const marks = readRubricMarks(value);
  for (const key of Object.keys(marks)) if (parseMarkKey(key) === null) delete marks[key];
  return marks;
}

/** One prompt's marks, keyed by criterion id — the shape `scoreRubric` reads. */
export function marksOf(marks: RubricMarks, itemId: string): RubricMarks {
  const prefix = `${itemId}:`;
  const out: RubricMarks = {};
  for (const [key, mark] of Object.entries(marks)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = mark;
  }
  return out;
}

export interface PromptOutcome {
  itemId: string;
  outcome: RubricOutcome;
}

export interface SpeakingOutcome {
  prompts: PromptOutcome[];
  /** Summed over prompts. */
  points: number;
  max: number;
  /** `round(points / max × 100)` — what progress and the SRS read. */
  percent: number;
  /** Every criterion of every prompt carries a mark. */
  complete: boolean;
  /** `itemId:criterionId` of every mark still missing, in prompt and snapshot order. */
  missing: string[];
  passedCount: number;
  /** Every prompt reached the threshold (Q1-A). */
  passed: boolean;
}

/**
 * Add the marks up, a prompt at a time. Only the prompts named are counted — a mark under an
 * id the submission does not hold moves nothing. A submission with no prompts is never
 * complete: there is nothing to have marked.
 */
export function scorePrompts(
  snapshot: SpeakingSnapshot,
  marks: RubricMarks,
  itemIds: readonly string[],
): SpeakingOutcome {
  const prompts = itemIds.map((itemId) => ({
    itemId,
    outcome: scoreRubric(snapshot, marksOf(marks, itemId)),
  }));
  const points = prompts.reduce((n, p) => n + p.outcome.points, 0);
  const max = prompts.reduce((n, p) => n + p.outcome.max, 0);
  const missing = prompts.flatMap((p) => p.outcome.missing.map((c) => markKey(p.itemId, c)));
  const passedCount = prompts.filter((p) => p.outcome.passed).length;
  return {
    prompts,
    points,
    max,
    percent: toPercent(points, max),
    complete: prompts.length > 0 && missing.length === 0,
    missing,
    passedCount,
    passed: prompts.length > 0 && passedCount === prompts.length,
  };
}

/**
 * The marks the builder preview pretends a teacher set (plan 70, Q8-A): one level for every
 * criterion of every prompt. Never sent anywhere.
 */
export function simulatedMarks(
  snapshot: SpeakingSnapshot,
  itemIds: readonly string[],
  level = 2,
): Record<string, number> {
  const marks: Record<string, number> = {};
  for (const itemId of itemIds) {
    for (const c of snapshot.criteria) marks[markKey(itemId, c.id)] = level;
  }
  return marks;
}
