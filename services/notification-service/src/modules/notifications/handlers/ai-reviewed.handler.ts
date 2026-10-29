import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { ExerciseAttemptAiReviewedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

/** The plain-English fallback subject — the in-app list re-words it from `templateData`. */
function subjectFor(outcome: 'approved' | 'returned', exercise: string | null): string {
  if (outcome === 'returned') {
    return exercise === null
      ? 'Your work was checked and sent back'
      : `“${exercise}” was checked and sent back`;
  }
  return exercise === null ? 'Your work was checked' : `“${exercise}” was checked`;
}

/**
 * A model's verdict closed a learner's work (VoxOrd mobile redesign 06, step 6a) — the
 * counterpart of `attempt_reviewed` where nobody, or nobody in time, read it.
 *
 * Both ways a model's verdict lands are news to the learner: at once, for work no teacher
 * reviews, and at the school's term, when the provisional review they were already reading
 * becomes the one that counts (`acceptedAtTerm`). A provisional verdict publishes nothing,
 * so it never reaches here. The review's text stays in exercise-engine; only ids, the
 * outcome, the mark and the work's names travel.
 */
@Injectable()
export class AiReviewedHandler implements IMessageHandler<ExerciseAttemptAiReviewedPayload> {
  readonly routingKey = 'exercise.attempt.ai_reviewed';
  private readonly logger = new Logger(AiReviewedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: ExerciseAttemptAiReviewedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Attempt AI-reviewed: attemptId=${payload.attemptId} outcome=${payload.outcome} [${meta.eventId}]`,
    );

    const exercisePath = payload.exercisePath ?? null;

    await this.repo.create({
      recipientId: payload.userId,
      type: NotificationType.AI_REVIEWED,
      channel: NotificationChannel.IN_APP,
      subject: subjectFor(payload.outcome, exercisePath?.exercise ?? null),
      templateKey: 'ai_reviewed',
      templateData: {
        attemptId: payload.attemptId,
        exerciseId: payload.exerciseId,
        templateCode: payload.templateCode,
        outcome: payload.outcome,
        // Older events carry neither; the reader words the row without them.
        score: payload.score ?? null,
        containerId: payload.containerId ?? null,
        exercisePath,
        acceptedAtTerm: payload.acceptedAtTerm === true,
        occurredAt: payload.occurredAt,
      },
    });
  }
}
