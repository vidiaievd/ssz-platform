import { lessonChangeFor } from './lesson-change.js';

const lesson = (over: Record<string, unknown> = {}) =>
  ({
    id: 'lesson-1',
    schoolId: 'school-1',
    groupId: 'group-1',
    teacherId: 'teacher-1',
    date: new Date('2026-11-03T00:00:00.000Z'),
    startTime: '17:30',
    endTime: '19:00',
    status: 'scheduled',
    type: 'lesson',
    ...over,
  }) as never;

const TODAY = '2026-10-29';

describe('lessonChangeFor', () => {
  it('reads a new day or time as a move, with where it was', () => {
    expect(
      lessonChangeFor(lesson(), lesson({ date: new Date('2026-11-04T00:00:00.000Z'), startTime: '18:00' }), TODAY),
    ).toEqual({
      lessonId: 'lesson-1',
      schoolId: 'school-1',
      groupId: 'group-1',
      newStatus: 'moved',
      teacherId: 'teacher-1',
      date: '2026-11-04',
      startTime: '18:00',
      endTime: '19:00',
      lessonType: 'lesson',
      previousDate: '2026-11-03',
      previousStartTime: '17:30',
      previousEndTime: '19:00',
    });
  });

  it('reads a cancellation, a deletion and an undone cancellation', () => {
    expect(lessonChangeFor(lesson(), lesson({ status: 'cancelled' }), TODAY)).toMatchObject({
      newStatus: 'cancelled',
      date: '2026-11-03',
    });
    expect(lessonChangeFor(lesson(), null, TODAY)).toMatchObject({ newStatus: 'cancelled' });
    const restored = lessonChangeFor(lesson({ status: 'cancelled' }), lesson(), TODAY);
    expect(restored).toMatchObject({ newStatus: 'scheduled' });
    expect(restored).not.toHaveProperty('previousDate');
  });

  it('says nothing of bookkeeping, of a lesson already cancelled, or of a held one', () => {
    expect(lessonChangeFor(lesson(), lesson({ teacherId: 'teacher-2' }), TODAY)).toBeNull();
    expect(lessonChangeFor(lesson(), lesson({ startTime: '17:30:00' }), TODAY)).toBeNull();
    expect(lessonChangeFor(lesson({ status: 'cancelled' }), lesson({ status: 'cancelled' }), TODAY)).toBeNull();
    expect(lessonChangeFor(lesson({ status: 'cancelled' }), null, TODAY)).toBeNull();
    expect(lessonChangeFor(lesson(), lesson({ status: 'held' }), TODAY)).toBeNull();
  });

  it('keeps the past quiet, but not a past lesson moved into the future', () => {
    const past = { date: new Date('2026-10-20T00:00:00.000Z') };
    expect(lessonChangeFor(lesson(past), lesson({ ...past, status: 'cancelled' }), TODAY)).toBeNull();
    expect(lessonChangeFor(lesson(past), lesson({ ...past, startTime: '09:00' }), TODAY)).toBeNull();
    expect(lessonChangeFor(lesson(past), lesson(), TODAY)).toMatchObject({
      newStatus: 'moved',
      previousDate: '2026-10-20',
    });
    // Today itself still counts.
    const today = { date: new Date(`${TODAY}T00:00:00.000Z`) };
    expect(lessonChangeFor(lesson(today), lesson({ ...today, status: 'cancelled' }), TODAY)).not.toBeNull();
  });
});
