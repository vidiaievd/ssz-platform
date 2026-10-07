// What a returned `read_aloud` leaves standing for the next try (plan 70, phase 11b, variant B).
//
// A teacher returns a submission when one prompt fails, but rules on every prompt. The prompts
// that passed stay passed: the next attempt starts with them **carried** — the recording, the
// marks, the teacher's comment and the attempt they were passed in, frozen — and the student
// records only the prompts that failed. The exercise is passed when every prompt is, carried
// and new alike.
//
// Why not re-record everything: the memory already heard about the passed prompt on the return
// (`gapResults`), and a second success minutes later would read as a second review at no
// interval; the prompt could regress on a bad take and lose a pass it had earned; and the
// teacher would grade the same recording twice.
//
// A carried prompt lives in the submission itself — `SubmittedRecording.carried` — so an attempt
// is complete on its own: the queue, the verdict, the learner's card and the try after this one
// all read it from the attempt's own column, never by walking back the chain. A prompt carried
// twice keeps the attempt it was first passed in.
//
// What the student is told before recording is only which prompts are carried and from which
// try (`CarriedPrompt`) — they were shown the marks and the comment on the return already, and
// the projection adds nothing to that.

import type { RubricMarks } from '../writing-task/verdict.js';
import { scoreRubric, toPercent } from '../writing-task/verdict.js';
import type { PromptOutcome, SpeakingOutcome, SpeakingSnapshot } from './rubric.js';
import { markKey, marksOf, readMarks, readSpeakingSnapshot, scorePrompts } from './rubric.js';
import type { Submission, SubmittedRecording } from './submission.js';
import { readSubmission } from './submission.js';

/** A prompt passed in an earlier try, as the try that carries it holds it. */
export interface CarriedRuling {
  /** The attempt the prompt was passed in — the first one, however many returns since. */
  attemptId: string;
  /** Which try that was, from 1 — «passed in attempt 1». */
  attempt: number;
  /** The marks it passed on, keyed by criterion id. */
  marks: Record<string, number>;
  /** Against the rubric frozen on the attempt it was passed in. */
  points: number;
  max: number;
  /** The teacher's comment on it. A returned `read_aloud` has one on every prompt. */
  comment: string;
}

/** What the student is told about a carried prompt before recording — no more than that. */
export interface CarriedPrompt {
  itemId: string;
  /** The try it was passed in, from 1. */
  attempt: number;
}

/** A returned attempt, as much of it as carrying needs. */
export interface ReturnedTry {
  id: string;
  /** 0 for the first try. */
  revisionCount: number;
  submittedAnswer: unknown;
  reviewDecisions: ReadonlyArray<{ itemId: string; approved: boolean; comment?: string }> | null;
  rubricMarks: unknown;
  rubricSnapshot: unknown;
}

/**
 * The recordings a new try inherits from the returned one: every prompt the teacher passed
 * that the exercise still has, in the exercise's order.
 *
 * A prompt the author has since deleted is not carried — there is nothing to answer — and a
 * prompt added since was never passed, so it is recorded. A try that was not ruled on prompt
 * by prompt (no decisions, a submission that does not read) carries nothing.
 */
export function carriedFrom(previous: ReturnedTry, promptIds: readonly string[]): SubmittedRecording[] {
  const submission = readSubmission(previous.submittedAnswer);
  if (submission === null) return [];

  const passed = new Map(
    (previous.reviewDecisions ?? [])
      .filter((decision) => decision.approved)
      .map((decision) => [decision.itemId, (decision.comment ?? '').trim()]),
  );
  const marks = readMarks(previous.rubricMarks);
  const snapshot = readSpeakingSnapshot(previous.rubricSnapshot);
  const byId = new Map(submission.recordings.map((r) => [r.itemId, r]));

  return promptIds.flatMap((itemId): SubmittedRecording[] => {
    const recording = byId.get(itemId);
    const comment = passed.get(itemId);
    if (recording === undefined || comment === undefined) return [];
    if (recording.carried) return [{ ...recording }];

    const own = numbersOf(marksOf(marks, itemId));
    const outcome = snapshot === null ? null : scoreRubric(snapshot, own);
    return [
      {
        ...recording,
        carried: {
          attemptId: previous.id,
          attempt: previous.revisionCount + 1,
          marks: own,
          points: outcome?.points ?? 0,
          max: outcome?.max ?? 0,
          comment,
        },
      },
    ];
  });
}

/** What the projection tells the student about the carried recordings. */
export function carriedPrompts(carried: readonly SubmittedRecording[]): CarriedPrompt[] {
  return carried.flatMap((r) => (r.carried ? [{ itemId: r.itemId, attempt: r.carried.attempt }] : []));
}

/**
 * The student's own part of a submission: the recordings of the prompts not carried, with any
 * `carried` a client wrote stripped. A recording sent for a carried prompt is dropped rather
 * than refused — a client that predates carrying sends every prompt, and the pass it would
 * overwrite is the one that stands.
 */
export function freshPart(submission: Submission, carried: readonly SubmittedRecording[]): Submission {
  const skip = new Set(carried.map((r) => r.itemId));
  return {
    recordings: submission.recordings
      .filter((r) => !skip.has(r.itemId))
      .map(({ carried: _ignored, ...r }) => r),
  };
}

/** The whole submission: the student's recordings and the carried ones, in the exercise's order. */
export function withCarried(
  fresh: Submission,
  carried: readonly SubmittedRecording[],
  promptIds: readonly string[],
): Submission {
  const all = [...fresh.recordings, ...carried];
  const rank = new Map(promptIds.map((id, index) => [id, index]));
  const order = (r: SubmittedRecording) => rank.get(r.itemId) ?? promptIds.length;
  return { recordings: [...all].sort((a, b) => order(a) - order(b)) };
}

/**
 * The verdict over a whole submission: the new recordings out of the teacher's marks, the
 * carried ones as they were passed — frozen, never re-scored against today's rubric, which
 * could have gained a criterion nobody marked them on.
 *
 * Complete when every new prompt is marked (a submission with only carried prompts has
 * nothing left to mark); passed when every prompt, carried or new, is.
 */
export function scoreSubmission(
  snapshot: SpeakingSnapshot,
  marks: RubricMarks,
  recordings: readonly SubmittedRecording[],
): SpeakingOutcome {
  const freshIds = recordings.filter((r) => !r.carried).map((r) => r.itemId);
  const fresh = scorePrompts(snapshot, marks, freshIds);
  const scored = new Map(fresh.prompts.map((p) => [p.itemId, p]));

  const prompts = recordings.map((r): PromptOutcome => {
    if (!r.carried) return scored.get(r.itemId)!;
    const { points, max } = r.carried;
    return {
      itemId: r.itemId,
      outcome: { points, max, percent: toPercent(points, max), complete: true, missing: [], passed: true },
      carried: r.carried,
    };
  });

  const points = prompts.reduce((n, p) => n + p.outcome.points, 0);
  const max = prompts.reduce((n, p) => n + p.outcome.max, 0);
  const passedCount = prompts.filter((p) => p.outcome.passed).length;
  return {
    prompts,
    points,
    max,
    percent: toPercent(points, max),
    complete: prompts.length > 0 && fresh.missing.length === 0,
    missing: fresh.missing,
    passedCount,
    passed: prompts.length > 0 && passedCount === prompts.length,
  };
}

/**
 * The marks to store on the attempt: the teacher's for the new prompts, the frozen ones for the
 * carried — so the learner's card and the next try read every prompt off one column. A mark a
 * client sent for a carried prompt is not the teacher's to change and is dropped.
 */
export function marksWithCarried(
  marks: RubricMarks,
  recordings: readonly SubmittedRecording[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of recordings) {
    const own = r.carried ? r.carried.marks : numbersOf(marksOf(marks, r.itemId));
    for (const [criterionId, mark] of Object.entries(own)) out[markKey(r.itemId, criterionId)] = mark;
  }
  return out;
}

function numbersOf(marks: RubricMarks): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, mark] of Object.entries(marks)) if (typeof mark === 'number') out[key] = mark;
  return out;
}
