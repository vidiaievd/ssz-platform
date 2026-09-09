import type { ReviewQueueCursor } from '../../../domain/repositories/attempt.repository.js';

/**
 * The cursor as the caller sees it: one opaque token, so that the client cannot page by
 * arithmetic and the shape stays ours to change.
 */
export function encodeReviewQueueCursor(cursor: ReviewQueueCursor): string {
  return Buffer.from(`${cursor.submittedAt.toISOString()}|${cursor.id}`, 'utf8').toString(
    'base64url',
  );
}

/**
 * `null` for anything that is not a cursor this service issued.
 *
 * The caller turns that into a 422 rather than quietly serving the first page again: a
 * teacher who is on page four and gets page one back has no way to tell.
 */
export function decodeReviewQueueCursor(raw: string): ReviewQueueCursor | null {
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
