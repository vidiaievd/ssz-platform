import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationChannel, NotificationType } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import { LessonsClient } from './clients/lessons.client.js';
import { composeReminders, key, tomorrowOf, type RemindableLesson } from './lesson-reminder.composer.js';

/** Hourly, and the run steps aside on hours that are not its own — as the digest does. */
const HOURLY = '0 0 * * * *';

/**
 * Telling a learner that they have a lesson tomorrow.
 *
 * The last open question of plan 62, and it belongs here rather than in scheduling for the
 * same reason the review digest does: the timetable knows *when a lesson is*, and this
 * service decides *whether to say something to a person about it*.
 *
 * In-app only, deliberately. An email the evening before a weekly lesson the learner
 * already knows about is the kind of message that teaches people to ignore a sender, and
 * the bell costs them nothing.
 */
@Injectable()
export class LessonReminderService {
  private readonly logger = new Logger(LessonReminderService.name);

  constructor(
    private readonly lessons: LessonsClient,
    private readonly notifications: NotificationsRepository,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  private get settings() {
    return this.config.get<AppConfig['lessonReminder']>('lessonReminder');
  }

  @Cron(HOURLY, { name: 'lesson-reminders' })
  async run(now = new Date()): Promise<void> {
    if (!this.settings?.enabled || !this.lessons.configured) return;
    if (now.getUTCHours() !== (this.settings.hour ?? 18)) return;

    await this.remind(now);
  }

  /** One pass: tomorrow's lessons, their rosters, and the people not yet told. */
  async remind(now: Date): Promise<number> {
    const day = tomorrowOf(now);
    const lessons = await this.lessons.lessonsOn(day);
    // Not "no lessons tomorrow" — "could not find out". Saying nothing is the right answer
    // to that, and the next run will ask again.
    if (lessons === null) return 0;
    if (lessons.length === 0) return 0;

    const membersByGroup = new Map<string, string[]>();
    for (const groupId of new Set(lessons.map((lesson) => lesson.groupId))) {
      const lesson = lessons.find((candidate) => candidate.groupId === groupId)!;
      const members = await this.lessons.membersOf(lesson.schoolId, groupId);
      if (members !== null) membersByGroup.set(groupId, members);
    }

    const told = await this.prisma.lessonReminder.findMany({
      where: { sessionId: { in: lessons.map((lesson) => lesson.id) } },
      select: { sessionId: true, userId: true },
    });

    const reminders = composeReminders({
      lessons: lessons as RemindableLesson[],
      membersByGroup,
      alreadyTold: new Set(told.map((row) => key(row.sessionId, row.userId))),
    });

    for (const reminder of reminders) {
      await this.notifications.create({
        recipientId: reminder.userId,
        type: NotificationType.LESSON_REMINDER,
        channel: NotificationChannel.IN_APP,
        subject: reminder.isExam
          ? `Checkpoint tomorrow at ${reminder.startTime}`
          : `Lesson tomorrow at ${reminder.startTime}`,
        templateKey: 'lesson_reminder',
        templateData: {
          lessonId: reminder.lessonId,
          date: reminder.date,
          startTime: reminder.startTime,
          endTime: reminder.endTime,
          isExam: reminder.isExam,
        },
      });

      // Written after the message: the failure mode is a repeat, never a silence.
      await this.prisma.lessonReminder.create({
        data: { sessionId: reminder.lessonId, userId: reminder.userId },
      });
    }

    if (reminders.length > 0) {
      this.logger.log(`Reminded ${reminders.length} learner(s) of lessons on ${day}`);
    }
    return reminders.length;
  }
}
