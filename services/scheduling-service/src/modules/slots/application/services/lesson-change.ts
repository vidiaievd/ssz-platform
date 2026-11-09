import type { LessonStatusChangedPayload } from '@ssz/contracts';
import type { Lesson } from '../../domain/entities/lesson.entity.js';

type Shape = Pick<
  Lesson,
  'id' | 'schoolId' | 'groupId' | 'teacherId' | 'date' | 'startTime' | 'endTime' | 'status' | 'type'
>;

const day = (date: Date): string => date.toISOString().slice(0, 10);
const hhmm = (time: string): string => time.slice(0, 5);

/**
 * What a write did to a lesson, as its learners would put it (VoxOrd plan 06, step 6c):
 * moved, cancelled, or a cancellation undone — or nothing worth telling them (`null`).
 *
 * Only when or whether a lesson happens is news; a topic, a room, attendance or a mark is
 * the teacher's bookkeeping. A lesson entirely in the past is never news either — fixing
 * last week's record must not reach anyone's phone. `after` is null when the session was
 * deleted, which for its learners is a cancellation. `today` is YYYY-MM-DD.
 */
export function lessonChangeFor(
  before: Shape,
  after: Shape | null,
  today: string,
): LessonStatusChangedPayload | null {
  const beforeDay = day(before.date);
  const afterDay = after ? day(after.date) : beforeDay;
  if (beforeDay < today && afterDay < today) return null;
  if (before.status === 'held' || after?.status === 'held') return null;

  const base = (lesson: Shape, newStatus: LessonStatusChangedPayload['newStatus']) => ({
    lessonId: lesson.id,
    schoolId: lesson.schoolId,
    groupId: lesson.groupId,
    newStatus,
    teacherId: lesson.teacherId,
    date: day(lesson.date),
    startTime: hhmm(lesson.startTime),
    endTime: hhmm(lesson.endTime),
    lessonType: lesson.type,
  });

  if (after === null) {
    return before.status === 'cancelled' ? null : base(before, 'cancelled');
  }
  if (after.status === 'cancelled') {
    return before.status === 'cancelled' ? null : base(after, 'cancelled');
  }
  if (before.status === 'cancelled') return base(after, 'scheduled');

  const moved =
    beforeDay !== afterDay ||
    hhmm(before.startTime) !== hhmm(after.startTime) ||
    hhmm(before.endTime) !== hhmm(after.endTime);
  if (!moved) return null;
  return {
    ...base(after, 'moved'),
    previousDate: beforeDay,
    previousStartTime: hhmm(before.startTime),
    previousEndTime: hhmm(before.endTime),
  };
}
