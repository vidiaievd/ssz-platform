import {
  composeReminders,
  key,
  tomorrowOf,
  type RemindableLesson,
} from '../../../src/modules/notifications/schedules/lesson-reminder.composer.js';

const lesson = (over: Partial<RemindableLesson> = {}): RemindableLesson => ({
  id: 'l1',
  groupId: 'g1',
  schoolId: 's1',
  date: '2026-09-17',
  startTime: '18:00',
  endTime: '19:30',
  status: 'scheduled',
  type: 'lesson',
  ...over,
});

const members = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

describe('who is reminded', () => {
  it('tells everyone in the group about their lesson', () => {
    const reminders = composeReminders({
      lessons: [lesson()],
      membersByGroup: members({ g1: ['anna', 'bjorn'] }),
      alreadyTold: new Set(),
    });

    expect(reminders.map((r) => [r.userId, r.startTime])).toEqual([
      ['anna', '18:00'],
      ['bjorn', '18:00'],
    ]);
  });

  it('says nothing twice about the same lesson', () => {
    const reminders = composeReminders({
      lessons: [lesson()],
      membersByGroup: members({ g1: ['anna', 'bjorn'] }),
      alreadyTold: new Set([key('l1', 'anna')]),
    });

    expect(reminders.map((r) => r.userId)).toEqual(['bjorn']);
  });

  it('skips a group whose roster could not be read rather than guessing at it', () => {
    const reminders = composeReminders({
      lessons: [lesson(), lesson({ id: 'l2', groupId: 'g2' })],
      membersByGroup: members({ g1: ['anna'] }),
      alreadyTold: new Set(),
    });

    expect(reminders.map((r) => r.lessonId)).toEqual(['l1']);
  });

  it('marks a checkpoint as one, so the message can say so', () => {
    const reminders = composeReminders({
      lessons: [lesson({ type: 'exam' })],
      membersByGroup: members({ g1: ['anna'] }),
      alreadyTold: new Set(),
    });

    expect(reminders[0]?.isExam).toBe(true);
  });

  it('reminds one learner of two lessons on the same day', () => {
    const reminders = composeReminders({
      lessons: [lesson(), lesson({ id: 'l2', startTime: '20:00' })],
      membersByGroup: members({ g1: ['anna'] }),
      alreadyTold: new Set(),
    });

    expect(reminders.map((r) => r.lessonId)).toEqual(['l1', 'l2']);
  });
});

describe('the day a reminder is about', () => {
  it('is the day after the run', () => {
    expect(tomorrowOf(new Date('2026-09-16T18:00:00.000Z'))).toBe('2026-09-17');
  });

  it('crosses a month end', () => {
    expect(tomorrowOf(new Date('2026-09-30T18:00:00.000Z'))).toBe('2026-10-01');
  });
});
