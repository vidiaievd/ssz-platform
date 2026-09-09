import type { MySubmissionsCursor } from '../../../domain/repositories/attempt.repository.js';

/**
 * The learner's own list, newest submission first.
 *
 * Its own opaque shape rather than the journal's (`review-decisions-cursor.ts`): that one
 * walks `reviewedAt`, and a `RETURNED` or `ROUTED_FOR_REVIEW` row has none yet. This one
 * walks `submittedAt`, which every row in the list carries — the selection itself
 * guarantees it (47.1).
 */
export function encodeMySubmissionsCursor(cursor: MySubmissionsCursor): string {
  return Buffer.from(`${cursor.submittedAt.toISOString()}|${cursor.id}`, 'utf8').toString(
    'base64url',
  );
}

/**
 * `null` for anything this service did not issue — the caller answers 422 rather than
 * quietly serving the first page again (the reason 44.6 gives, and every cursor here since).
 */
export function decodeMySubmissionsCursor(raw: string): MySubmissionsCursor | null {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const separator = decoded.indexOf('|');
  if (separator <= 0) return null;

  const submittedAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(submittedAt.getTime()) || id.length === 0) return null;

  return { submittedAt, id };
}
