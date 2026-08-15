import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { ExerciseAttemptReviewedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

/**
 * A teacher has marked a submission — plan 42.
 *
 * Written for both outcomes, including an approval with nothing said on it. The templates
 * that reach a marking queue are the ones whose check may only ever approve, so their
 * learners hand in work and then wait; from where they sit, an unread submission and one
 * read without comment look exactly alike. The wording is the web's business — what
 * travels here is the outcome, the mark and whether a person wrote anything.
 */
@Injectable()
export class AttemptReviewedHandler implements IMessageHandler<ExerciseAttemptReviewedPayload> {
  readonly routingKey = 'exercise.attempt.reviewed';
  private readonly logger = new Logger(AttemptReviewedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: ExerciseAttemptReviewedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Attempt reviewed: attemptId=${payload.attemptId} outcome=${payload.outcome} [${meta.eventId}]`,
    );

    await this.repo.create({
      recipientId: payload.userId,
      type: NotificationType.ATTEMPT_REVIEWED,
      channel: NotificationChannel.IN_APP,
      subject:
        payload.outcome === 'returned'
          ? 'Your teacher sent your work back'
          : 'Your teacher has marked your work',
      templateKey: 'attempt_reviewed',
      templateData: {
        attemptId: payload.attemptId,
        exerciseId: payload.exerciseId,
        templateCode: payload.templateCode,
        outcome: payload.outcome,
        score: payload.score,
        comment: payload.comment,
        approvedItems: payload.approvedItems,
        totalItems: payload.totalItems,
        occurredAt: payload.occurredAt,
      },
    });
  }
}
