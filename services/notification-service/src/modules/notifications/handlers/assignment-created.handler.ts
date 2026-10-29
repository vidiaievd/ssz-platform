import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { AssignmentCreatedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

/** The plain-English fallback subject — the in-app list re-words it from `templateData`. */
function subjectFor(title: string | null): string {
  return title === null ? 'You have a new assignment' : `New assignment: “${title}”`;
}

/**
 * A teacher gave a learner something to do (VoxOrd mobile redesign 06, step 6b).
 *
 * One letter per learner: a group assignment is already one event per member, written by
 * learning-service after it checked that member may see the content. The title is the one
 * content-service gave at creation — a letter is read later, and a renamed lesson should
 * not make an old one lie about what was asked. The teacher's note stays out: it is theirs
 * to edit, and the assignment itself shows it.
 */
@Injectable()
export class AssignmentCreatedHandler implements IMessageHandler<AssignmentCreatedPayload> {
  readonly routingKey = 'learning.assignment.created';
  private readonly logger = new Logger(AssignmentCreatedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: AssignmentCreatedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Assignment created: assignmentId=${payload.assignmentId} assignee=${payload.assigneeId} [${meta.eventId}]`,
    );

    const title = payload.contentTitle ?? null;

    await this.repo.create({
      recipientId: payload.assigneeId,
      type: NotificationType.ASSIGNMENT_NEW,
      channel: NotificationChannel.IN_APP,
      subject: subjectFor(title),
      templateKey: 'assignment_new',
      templateData: {
        assignmentId: payload.assignmentId,
        assignerId: payload.assignerId,
        schoolId: payload.schoolId,
        groupId: payload.groupId ?? null,
        contentType: payload.contentType,
        contentId: payload.contentId,
        // Older events carry no title; the reader words the row by the content's kind.
        contentTitle: title,
        dueAt: payload.dueAt,
      },
    });
  }
}
