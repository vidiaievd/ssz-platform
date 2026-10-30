import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { SCHEDULING_EVENT_TYPES, type LessonStatusChangedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { LessonsClient } from '../schedules/clients/lessons.client.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

/** The plain-English fallback subject — the in-app list re-words it from `templateData`. */
function subjectFor(payload: LessonStatusChangedPayload): string {
  const when = payload.startTime ? `${payload.date} ${payload.startTime}` : payload.date;
  switch (payload.newStatus) {
    case 'cancelled':
      return `Lesson on ${when} is cancelled`;
    case 'moved':
      return `Lesson moved to ${when}`;
    default:
      return `Lesson on ${when} is back on`;
  }
}

/**
 * A lesson moved, was cancelled, or is back on (VoxOrd mobile redesign 06, step 6c).
 *
 * The event names a group, not people: the roster is read now, from organization-service,
 * as the day-before reminder reads it — the learners in the group when the lesson changed
 * are the ones who planned around it. The teacher made the change and is left out. A roster
 * that cannot be read fails the message, so the consumer's retry gets a second try rather
 * than nobody being told.
 */
@Injectable()
export class LessonChangedHandler implements IMessageHandler<LessonStatusChangedPayload> {
  readonly routingKey = SCHEDULING_EVENT_TYPES.LESSON_STATUS_CHANGED;
  private readonly logger = new Logger(LessonChangedHandler.name);

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly lessons: LessonsClient,
  ) {}

  async handle(payload: LessonStatusChangedPayload, meta: MessageMeta): Promise<void> {
    const members = await this.lessons.membersOf(payload.schoolId, payload.groupId);
    if (members === null) {
      throw new Error(`Roster of group ${payload.groupId} unavailable [${meta.eventId}]`);
    }
    const recipients = members.filter((userId) => userId !== payload.teacherId);
    this.logger.log(
      `Lesson ${payload.newStatus}: lessonId=${payload.lessonId} recipients=${recipients.length} [${meta.eventId}]`,
    );

    const subject = subjectFor(payload);
    for (const recipientId of recipients) {
      await this.repo.create({
        recipientId,
        type: NotificationType.LESSON_CHANGED,
        channel: NotificationChannel.IN_APP,
        subject,
        templateKey: 'lesson_changed',
        templateData: {
          lessonId: payload.lessonId,
          schoolId: payload.schoolId,
          groupId: payload.groupId,
          change: payload.newStatus,
          date: payload.date,
          startTime: payload.startTime ?? null,
          endTime: payload.endTime ?? null,
          isExam: payload.lessonType === 'exam',
          previousDate: payload.previousDate ?? null,
          previousStartTime: payload.previousStartTime ?? null,
          previousEndTime: payload.previousEndTime ?? null,
        },
      });
    }
  }
}
