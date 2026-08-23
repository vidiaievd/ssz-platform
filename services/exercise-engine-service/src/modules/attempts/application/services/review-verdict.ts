import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import type { Attempt, ReviewDecision } from '../../domain/entities/attempt.entity.js';

/**
 * Saved first, published after: an event about a verdict nobody stored is a lie.
 *
 * A free function rather than a method on either handler, because the batch delivers a
 * verdict per submission and has to do it in exactly the order the single one does.
 */
export async function publishAttemptEvents(
  publisher: IEventPublisher,
  attempt: Attempt,
): Promise<void> {
  for (const event of attempt.getDomainEvents()) {
    await publisher.publish(event.eventType, event.payload);
  }
  attempt.clearDomainEvents();
}

/**
 * The per-sentence notes, merged into the decisions the teacher made.
 *
 * A note on a sentence nobody ruled on becomes a decision carrying the note, and its
 * `approved` follows the verdict on the submission as a whole: a teacher who explains a
 * sentence and approves the work has not rejected that sentence. It reads as a record
 * rather than as a ruling — the score is computed from what the approval credits
 * (`creditedByApproval`), never from this journal.
 */
export function foldSentenceComments(
  decisions: ReviewDecision[],
  sentenceComments: Record<string, string>,
  outcome: 'approved' | 'returned',
): ReviewDecision[] {
  const entries = Object.entries(sentenceComments).filter(
    ([, comment]) => typeof comment === 'string' && comment.trim() !== '',
  );
  if (entries.length === 0) return decisions;

  const byItem = new Map(decisions.map((decision) => [decision.itemId, { ...decision }]));
  for (const [itemId, comment] of entries) {
    const existing = byItem.get(itemId);
    if (existing) {
      existing.comment = comment;
    } else {
      byItem.set(itemId, { itemId, approved: outcome === 'approved', comment });
    }
  }

  return [...byItem.values()];
}
