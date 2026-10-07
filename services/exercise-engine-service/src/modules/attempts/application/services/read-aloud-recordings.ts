import { carriedFrom, fromPersisted, readContent, readSubmission } from '@ssz/shared-kernel/read-aloud';
import type { Submission, SubmittedRecording } from '@ssz/shared-kernel/read-aloud';
import type { Attempt } from '../../domain/entities/attempt.entity.js';
import { ValidationError } from '../../../../shared/application/ports/answer-validator.port.js';
import type { MediaAssetDescription } from '../../../../shared/application/ports/media-assets.port.js';

/** media-service's kind for a student's voice (plan 70, Q2-A). */
export const SUBMISSION_RECORDING = 'submission_recording';

/**
 * How far the server's measurement may stray from the prompt's range — the same half second
 * the audio layer allows a segment past its clip (`AUD_SEG_BEYOND`, plan 68). A recorder
 * stopped by its own clock at `maxSeconds` lands a few frames over it once encoded.
 */
export const DURATION_TOLERANCE_SECONDS = 0.5;

export type RecordingRefusalCode =
  /** A prompt of the exercise has no recording in the submission. */
  | 'RA_RECORDING_MISSING'
  /** A recording names a prompt the exercise does not have, or the same prompt twice. */
  | 'RA_RECORDING_UNKNOWN_PROMPT'
  /** One file handed in for two prompts. */
  | 'RA_RECORDING_DUPLICATE'
  /** No such recording — or not this student's, or not made for this attempt. */
  | 'RA_RECORDING_NOT_FOUND'
  /** The upload was never finished, so the server has not measured it. */
  | 'RA_RECORDING_NOT_READY'
  /** media-service refused the file on ingest (too big, too long, not audio). */
  | 'RA_RECORDING_FAILED'
  /** The chosen take is shorter or longer than its prompt allows. */
  | 'RA_RECORDING_LENGTH';

/**
 * A `read_aloud` submission refused before it reached the validator.
 *
 * A 422 with the prompts it is about, so the runner can point at them. The submission is
 * not written onto the attempt when this is returned — the draft and the takes in it are
 * exactly where the student left them.
 */
export class RecordingRefusal extends ValidationError {
  constructor(
    public readonly code: RecordingRefusalCode,
    message: string,
    /** The prompts the refusal is about, in the exercise's order. */
    public readonly itemIds: string[],
  ) {
    super(code, message);
    this.name = 'RecordingRefusal';
  }
}

export function isRecordingRefusal(error: unknown): error is RecordingRefusal {
  return error instanceof RecordingRefusal;
}

/** The asset ids a submission asks media-service about: every take sent, chosen or not. */
export function assetIdsOf(submission: Submission): string[] {
  return submission.recordings.flatMap((r) => [
    r.assetId,
    ...(r.discarded ?? []).map((d) => d.assetId),
  ]);
}

/** The submission off the request, or the refusal for one that is not a submission at all. */
export function readRecordings(submitted: unknown): Submission | ValidationError {
  const submission = readSubmission(submitted);
  return (
    submission ??
    new ValidationError(
      'SCHEMA_MISMATCH',
      'A read_aloud answer is { recordings: [{ itemId, assetId, seconds, takes, discarded? }] }',
    )
  );
}

/**
 * The prompts a try inherits from the returned one it follows (plan 70, phase 11b): the ones
 * the teacher passed, frozen with their recording, marks and comment — so the student records
 * only what failed.
 *
 * Only after a return under `revision: 'return'`. Under `once` a failing verdict closes the
 * work, and a later try is a new start that records everything. `content` is either the
 * document or the student's projection of it — both carry the prompt ids and the policy in the
 * same places, and nothing else is read.
 */
export function carriedInto(previous: Attempt | null, content: unknown): SubmittedRecording[] {
  if (previous === null || previous.status !== 'RETURNED') return [];
  const document = readContent(content);
  if (document.settings.revision !== 'return') return [];
  return carriedFrom(
    {
      id: previous.id,
      revisionCount: previous.revisionCount,
      submittedAnswer: previous.submittedAnswer,
      reviewDecisions: previous.reviewDecisions,
      rubricMarks: previous.rubricMarks,
      rubricSnapshot: previous.rubricSnapshot,
    },
    document.prompts.map((p) => p.id),
  );
}

/**
 * The part of the check that needs no media-service: does the submission answer exactly the
 * prompts the exercise has, each once, each with a file of its own — the carried prompts
 * excepted, which the student does not record again.
 */
export function checkPrompts(
  submission: Submission,
  content: unknown,
  expectedAnswers: unknown,
  carried: ReadonlySet<string> = new Set(),
): RecordingRefusal | null {
  const promptIds = fromPersisted(content, expectedAnswers).prompts.map((p) => p.id);
  const known = new Set(promptIds);

  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const r of submission.recordings) {
    if (!known.has(r.itemId) || seen.has(r.itemId)) unknown.push(r.itemId);
    seen.add(r.itemId);
  }
  if (unknown.length > 0) {
    return new RecordingRefusal(
      'RA_RECORDING_UNKNOWN_PROMPT',
      'A recording names a prompt this exercise does not have, or names one twice',
      unknown,
    );
  }

  const missing = promptIds.filter((id) => !seen.has(id) && !carried.has(id));
  if (missing.length > 0) {
    return new RecordingRefusal(
      'RA_RECORDING_MISSING',
      'Every prompt needs a recording before the work can be handed in',
      missing,
    );
  }

  const owner = new Map<string, string>();
  const duplicate: string[] = [];
  for (const r of submission.recordings) {
    for (const assetId of [r.assetId, ...(r.discarded ?? []).map((d) => d.assetId)]) {
      const first = owner.get(assetId);
      if (first !== undefined) {
        // A take kept twice under its own prompt is harmless and not worth a refusal; the
        // same file answering two prompts is one recording passed off as two.
        if (first !== r.itemId && !duplicate.includes(r.itemId)) duplicate.push(r.itemId);
      } else {
        owner.set(assetId, r.itemId);
      }
    }
  }
  if (duplicate.length > 0) {
    return new RecordingRefusal(
      'RA_RECORDING_DUPLICATE',
      'One recording was handed in for more than one prompt',
      duplicate,
    );
  }

  return null;
}

/**
 * The part that does: is every file the student's, made for this attempt, stored, and — for
 * the take they chose — as long as its prompt allows (plan 70 §3.5, RA-U9).
 *
 * "Not yours", "not this attempt", "deleted" and "never existed" are one answer. A student
 * probing someone else's asset id learns nothing from the difference, and the BFF of the queue
 * plays whatever id a submission names, so an id that passed here is one a teacher will hear.
 *
 * The length is the server's measurement, never the `seconds` the client sent; the discarded
 * takes kept under `keepAllTakes` are checked for ownership only — the student was not asked
 * to keep them within the range, only to choose one that is.
 *
 * The refusal names every prompt that fails the first rule broken, in the exercise's order.
 */
export function checkAssets(
  submission: Submission,
  content: unknown,
  expectedAnswers: unknown,
  assets: MediaAssetDescription[],
  attempt: { id: string; userId: string },
): RecordingRefusal | null {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const prompts = new Map(
    fromPersisted(content, expectedAnswers).prompts.map((p) => [p.id, p]),
  );

  const notFound: string[] = [];
  const notReady: string[] = [];
  const failed: string[] = [];
  const length: string[] = [];

  for (const r of submission.recordings) {
    const files = [r.assetId, ...(r.discarded ?? []).map((d) => d.assetId)].map((id) =>
      byId.get(id),
    );

    if (files.some((a) => a === undefined || !isTheirs(a, attempt))) {
      notFound.push(r.itemId);
      continue;
    }
    if (files.some((a) => a!.status === 'FAILED')) {
      failed.push(r.itemId);
      continue;
    }
    if (files.some((a) => a!.status === 'PENDING_UPLOAD' || a!.durationMs === null)) {
      notReady.push(r.itemId);
      continue;
    }

    const chosen = byId.get(r.assetId)!;
    const prompt = prompts.get(r.itemId);
    if (prompt && !withinRange(chosen.durationMs!, prompt.minSeconds, prompt.maxSeconds)) {
      length.push(r.itemId);
    }
  }

  if (notFound.length > 0) {
    return new RecordingRefusal(
      'RA_RECORDING_NOT_FOUND',
      'A recording could not be found for this attempt',
      notFound,
    );
  }
  if (failed.length > 0) {
    return new RecordingRefusal(
      'RA_RECORDING_FAILED',
      'A recording was refused when it was uploaded — record it again',
      failed,
    );
  }
  if (notReady.length > 0) {
    return new RecordingRefusal(
      'RA_RECORDING_NOT_READY',
      'A recording has not finished uploading',
      notReady,
    );
  }
  if (length.length > 0) {
    return new RecordingRefusal(
      'RA_RECORDING_LENGTH',
      'A recording is shorter or longer than its prompt allows',
      length,
    );
  }
  return null;
}

function isTheirs(asset: MediaAssetDescription, attempt: { id: string; userId: string }): boolean {
  return (
    asset.entityType === SUBMISSION_RECORDING &&
    asset.entityId === attempt.id &&
    asset.ownerId === attempt.userId &&
    asset.status !== 'DELETED'
  );
}

function withinRange(durationMs: number, minSeconds: number, maxSeconds: number): boolean {
  const seconds = durationMs / 1000;
  return (
    seconds >= minSeconds - DURATION_TOLERANCE_SECONDS &&
    seconds <= maxSeconds + DURATION_TOLERANCE_SECONDS
  );
}
