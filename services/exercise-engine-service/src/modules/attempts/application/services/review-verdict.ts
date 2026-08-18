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
 * A note on a sentence the teacher decided nothing about becomes a decision that does not
 * approve it — which is what "not approved" already meant for an item nobody ruled on, so
 * the score is unchanged and the remark is kept rather than dropped on the floor.
 */
export function foldSentenceComments(
  decisions: ReviewDecision[],
  sentenceComments: Record<string, string>,
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
      byItem.set(itemId, { itemId, approved: false, comment });
    }
  }

  return [...byItem.values()];
}
