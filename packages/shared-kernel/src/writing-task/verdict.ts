// The arithmetic behind a teacher's verdict on a `writing_task` — plan 50 §3.2.
//
// The handoff grades a text with a rubric: the teacher sets one mark 0-3 per criterion,
// the score is `Σ mark × weight`, and the verdict follows from `settings.passScore`. The
// platform grades everything else out of items and speaks in percent — the SRS consumer
// reads `score < 60` as a failure (`exercise-attempted.consumer.ts`), so a passed essay
// worth 11 of 15 must not travel as `11`. Both facts live here: the rubric total in
// rubric points, and the same result normalized to the percent every other consumer of
// a score already understands.
//
// Two rules this file exists to keep:
//
// - **The threshold is compared in points, never in percent.** `passScore` is what the
//   author typed into the builder, in the same unit as the marks.
// - **The snapshot, not the live rubric.** Marks are meaningless without the criteria
//   they were set against, so grading reads the copy taken when the submission was
//   queued (IMPLEMENTATION.md's "Persistence": a teacher editing criteria after grading
//   must not change past marks).
//
// Nothing here decides a mark. Marks come from a person; this only adds them up.

import { rubricMax } from './analysis.js';
import type { Criterion, Settings, WritingTaskContent } from './model.js';

/**
 * One criterion as it stood when the submission was queued.
 *
 * Carries `levels` — unlike the `content` column's criteria, which leave the descriptors
 * in `expected_answers` (persistence.ts). The queue draws four labelled segments per
 * criterion, and a snapshot without the labels would send the teacher back to the live
 * exercise for exactly the wording the snapshot exists to freeze. `metric` is left out:
 * it drives mark *suggestions*, which are a property of the exercise as it is today, not
 * of a submission already written.
 */
export interface SnapshotCriterion {
  id: string;
  name: string;
  desc: string;
  weight: 1 | 2;
  levels: readonly [string, string, string, string];
}

/** The rubric and its threshold, frozen at the moment the submission reached the queue. */
export interface RubricSnapshot {
  criteria: SnapshotCriterion[];
  /** In rubric points, out of `Σ 3 × weight`. */
  passScore: number;
}

/** What a teacher set, keyed by criterion id. Absent or null means "not marked yet". */
export type RubricMarks = Record<string, number | null | undefined>;

/** The score a set of marks is worth, in both units, plus whether it is a whole rubric. */
export interface RubricOutcome {
  /** `Σ mark × weight`. */
  points: number;
  /** `Σ 3 × weight` — the ceiling. */
  max: number;
  /** `round(points / max × 100)` — what the SRS and every other consumer read. */
  percent: number;
  /** Every criterion in the snapshot carries a mark. */
  complete: boolean;
  /** Criterion ids still unmarked, in snapshot order. */
  missing: string[];
  /** `points >= passScore`, compared in points. */
  passed: boolean;
}

/** The snapshot to store when a submission is queued for review. */
export function snapshotRubric(
  document: Pick<WritingTaskContent, 'rubric'> & { settings: Pick<Settings, 'passScore'> },
): RubricSnapshot {
  return {
    criteria: document.rubric.map((c: Criterion) => ({
      id: c.id,
      name: c.name,
      desc: c.desc,
      weight: c.weight,
      levels: c.levels,
    })),
    passScore: document.settings.passScore,
  };
}

/**
 * Add the marks up against the snapshot.
 *
 * Only criteria the snapshot names are counted, and only marks that are whole numbers
 * 0-3 count as marks at all: these arrive from a client, and neither a criterion it
 * invented nor a 9 it sent may move a score. Anything else — absent, null, out of range
 * — reads as unmarked, contributes nothing and is reported in `missing`. Whether an
 * incomplete rubric is an error is the caller's decision, not the arithmetic's.
 */
export function scoreRubric(snapshot: RubricSnapshot, marks: RubricMarks): RubricOutcome {
  const missing: string[] = [];
  let points = 0;

  for (const criterion of snapshot.criteria) {
    const mark = readMark(marks[criterion.id]);
    if (mark === null) {
      missing.push(criterion.id);
      continue;
    }
    points += mark * criterion.weight;
  }

  const max = rubricMax({ rubric: snapshot.criteria });

  return {
    points,
    max,
    percent: toPercent(points, max),
    complete: missing.length === 0,
    missing,
    passed: points >= snapshot.passScore,
  };
}

/**
 * `points` as a percentage of the ceiling.
 *
 * A rubric with no criteria scores 100 rather than dividing by zero: the exercise cannot
 * be marked down on criteria it does not have, and a teacher who approved it approved it.
 */
export function toPercent(points: number, max: number): number {
  return max === 0 ? 100 : Math.round((points / max) * 100);
}

/**
 * Read a snapshot back out of a JSON column.
 *
 * Returns `null` for anything that is not a usable rubric — an attempt queued before this
 * existed, or a column written by an older shape. The caller then has an honest "this
 * submission has no rubric" rather than an empty one that would score every essay 100.
 */
export function readRubricSnapshot(value: unknown): RubricSnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const record = value as { criteria?: unknown; passScore?: unknown };
  if (!Array.isArray(record.criteria)) return null;

  const criteria = record.criteria.flatMap((raw): SnapshotCriterion[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const c = raw as Partial<SnapshotCriterion>;
    if (typeof c.id !== 'string' || c.id === '') return [];
    return [
      {
        id: c.id,
        name: typeof c.name === 'string' ? c.name : '',
        desc: typeof c.desc === 'string' ? c.desc : '',
        weight: c.weight === 2 ? 2 : 1,
        levels: readLevels(c.levels),
      },
    ];
  });

  if (criteria.length === 0) return null;

  const passScore = record.passScore;
  return {
    criteria,
    passScore: typeof passScore === 'number' && Number.isFinite(passScore) ? passScore : 0,
  };
}

/** Read marks off a request or a JSON column: whole numbers 0-3, everything else dropped. */
export function readRubricMarks(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  const marks: Record<string, number> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const mark = readMark(raw);
    if (mark !== null) marks[id] = mark;
  }
  return marks;
}

function readMark(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const mark = Math.round(value);
  if (mark < 0 || mark > 3) return null;
  return mark;
}

function readLevels(value: unknown): readonly [string, string, string, string] {
  const levels = Array.isArray(value) ? value : [];
  const at = (i: number): string => (typeof levels[i] === 'string' ? (levels[i] as string) : '');
  return [at(0), at(1), at(2), at(3)];
}
