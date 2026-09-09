import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { ExerciseAttemptReviewedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

/**
 * The fallback subject, for the one channel that has no reader to translate it.
 *
 * The in-app list re-words all of this from `templateData` in the reader's own language,
 * so this line is a plain-English last resort — an email digest, a log, a debugging
 * session. It names the exercise when the attempt carried a path, because "your work" is
 * a poor thing to be told about when twelve pieces were handed in at once.
 */
function subjectFor(outcome: 'approved' | 'returned', exercise: string | null): string {
  if (outcome === 'returned') {
    return exercise === null
      ? 'Your teacher sent your work back'
      : `Your teacher sent “${exercise}” back`;
  }
  return exercise === null
    ? 'Your teacher has marked your work'
    : `Your teacher has marked “${exercise}”`;
}

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

    const exercise = payload.exercisePath?.exercise ?? null;

    await this.repo.create({
      recipientId: payload.userId,
      type: NotificationType.ATTEMPT_REVIEWED,
      channel: NotificationChannel.IN_APP,
      subject: subjectFor(payload.outcome, exercise),
      templateKey: 'attempt_reviewed',
      templateData: {
        attemptId: payload.attemptId,
        exerciseId: payload.exerciseId,
        templateCode: payload.templateCode,
        outcome: payload.outcome,
        score: payload.score,
        comment: payload.comment,
        // Not `comment !== null`: a teacher may approve with nothing said in general and
        // a remark on one sentence, and the learner must still be sent to read it. It is
        // what separates "marked, nothing to add" from "marked, go and look".
        hasComment: payload.hasComment,
        approvedItems: payload.approvedItems,
        totalItems: payload.totalItems,
        // Where the work is, so the message can lead back to it. Held here rather than
        // resolved by whoever reads the notification: a letter is read weeks after it is
        // written, and by then the exercise may have moved or gone (plan 47.4).
        containerId: payload.containerId,
        exercisePath: payload.exercisePath,
        occurredAt: payload.occurredAt,
      },
    });
  }
}
