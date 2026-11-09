import { LessonChangedHandler } from '../../../src/modules/notifications/handlers/lesson-changed.handler.js';
import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';
import { LessonsClient } from '../../../src/modules/notifications/schedules/clients/lessons.client.js';
import { NotificationType, NotificationChannel } from '../../../generated/prisma/enums.js';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const makeMeta = (): MessageMeta => ({
  eventId: 'evt-6c',
  eventType: 'scheduling.lesson.status.changed',
  occurredAt: new Date().toISOString(),
  source: 'scheduling-service',
});

const moved = (overrides: Record<string, unknown> = {}) => ({
  lessonId: 'lesson-1',
  schoolId: 'school-1',
  groupId: 'group-1',
  newStatus: 'moved' as const,
  teacherId: 'teacher-1',
  date: '2026-11-04',
  startTime: '18:00',
  endTime: '19:30',
  lessonType: 'lesson',
  previousDate: '2026-11-03',
  previousStartTime: '17:30',
  previousEndTime: '19:00',
  ...overrides,
});

describe('LessonChangedHandler', () => {
  let repo: jest.Mocked<Pick<NotificationsRepository, 'create'>>;
  let lessons: jest.Mocked<Pick<LessonsClient, 'membersOf'>>;
  let handler: LessonChangedHandler;

  beforeEach(() => {
    repo = { create: jest.fn().mockResolvedValue(undefined as any) };
    lessons = { membersOf: jest.fn().mockResolvedValue(['learner-1', 'learner-2', 'teacher-1']) };
    handler = new LessonChangedHandler(repo as any, lessons as any);
  });

  it('tells every learner of the group, not the teacher, where the lesson went', async () => {
    await handler.handle(moved() as never, makeMeta());

    expect(lessons.membersOf).toHaveBeenCalledWith('school-1', 'group-1');
    expect(repo.create).toHaveBeenCalledTimes(2);
    expect(repo.create.mock.calls.map(([data]) => data.recipientId)).toEqual(['learner-1', 'learner-2']);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.LESSON_CHANGED,
        channel: NotificationChannel.IN_APP,
        templateKey: 'lesson_changed',
        subject: 'Lesson moved to 2026-11-04 18:00',
        templateData: {
          lessonId: 'lesson-1',
          schoolId: 'school-1',
          groupId: 'group-1',
          change: 'moved',
          date: '2026-11-04',
          startTime: '18:00',
          endTime: '19:30',
          isExam: false,
          previousDate: '2026-11-03',
          previousStartTime: '17:30',
          previousEndTime: '19:00',
        },
      }),
    );
  });

  it('words a cancelled exam, with nothing about where it was', async () => {
    const { previousDate: _d, previousStartTime: _s, previousEndTime: _e, ...cancelled } = moved({
      newStatus: 'cancelled',
      date: '2026-11-03',
      startTime: '17:30',
      lessonType: 'exam',
    });

    await handler.handle(cancelled as never, makeMeta());

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Lesson on 2026-11-03 17:30 is cancelled',
        templateData: expect.objectContaining({
          change: 'cancelled',
          isExam: true,
          previousDate: null,
        }),
      }),
    );
  });

  it('fails the message when the roster cannot be read, so it is retried', async () => {
    lessons.membersOf.mockResolvedValue(null);

    await expect(handler.handle(moved() as never, makeMeta())).rejects.toThrow('Roster');
    expect(repo.create).not.toHaveBeenCalled();
  });
});
