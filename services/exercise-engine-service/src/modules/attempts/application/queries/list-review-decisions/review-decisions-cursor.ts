import type { ReviewDecisionsCursor } from '../../../domain/repositories/attempt.repository.js';

/**
 * The journal's cursor: the verdict the last page ended on.
 *
 * The same opaque shape the queue uses, against a different column — the journal walks
 * backwards through `reviewedAt`, the queue forwards through `submittedAt`, and a token
 * from one is meaningless to the other by design.
 */
export function encodeReviewDecisionsCursor(cursor: ReviewDecisionsCursor): string {
  return Buffer.from(`${cursor.reviewedAt.toISOString()}|${cursor.id}`, 'utf8').toString(
    'base64url',
  );
}

/**
 * `null` for anything this service did not issue — the caller answers 422 rather than
 * quietly serving the first page again (the reason 44.6 gives).
 */
export function decodeReviewDecisionsCursor(raw: string): ReviewDecisionsCursor | null {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const separator = decoded.indexOf('|');
  if (separator <= 0) return null;

  const reviewedAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(reviewedAt.getTime()) || id.length === 0) return null;

  return { reviewedAt, id };
}
