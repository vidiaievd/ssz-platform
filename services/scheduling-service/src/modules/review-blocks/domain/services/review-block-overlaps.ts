import { dayKey, type ReviewBlockOccurrence } from '../entities/review-block.entity.js';

/** What of a lesson the overlap check needs — nothing about groups or learners. */
export interface TimedLesson {
  id: string;
  teacherId: string | null;
  date: Date;
  startTime: string;
  endTime: string;
  status: string;
}

export type ReviewBlockOverlap =
  | { kind: 'block_lesson'; teacherId: string; date: string; blockId: string; lessonId: string }
  | { kind: 'blocks'; teacherId: string; date: string; blockAId: string; blockBId: string };

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
  return minutes(a.startTime) < minutes(b.endTime) && minutes(b.startTime) < minutes(a.endTime);
}

/**
 * Where held marking time runs into a lesson, or into another block, of the same
 * teacher on the same day (plan 81, step 3). Reported, never refused: the lesson wins
 * the slot and the teacher moves the block, so the overlap is something to show, not
 * a rule to enforce. Cancelled lessons free their slot and are not counted.
 */
export function findReviewBlockOverlaps(
  occurrences: ReviewBlockOccurrence[],
  lessons: TimedLesson[],
): ReviewBlockOverlap[] {
  const lessonsByKey = new Map<string, TimedLesson[]>();
  for (const lesson of lessons) {
    if (lesson.status === 'cancelled' || !lesson.teacherId) continue;
    const key = `${lesson.teacherId}::${dayKey(lesson.date)}`;
    lessonsByKey.set(key, [...(lessonsByKey.get(key) ?? []), lesson]);
  }

  const blocksByKey = new Map<string, ReviewBlockOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = `${occurrence.teacherId}::${dayKey(occurrence.date)}`;
    blocksByKey.set(key, [...(blocksByKey.get(key) ?? []), occurrence]);
  }

  const out: ReviewBlockOverlap[] = [];
  for (const [key, dayBlocks] of blocksByKey) {
    const [teacherId, date] = key.split('::') as [string, string];
    for (const block of dayBlocks) {
      for (const lesson of lessonsByKey.get(key) ?? []) {
        if (overlaps(block, lesson)) {
          out.push({ kind: 'block_lesson', teacherId, date, blockId: block.blockId, lessonId: lesson.id });
        }
      }
    }
    for (let i = 0; i < dayBlocks.length; i++) {
      for (let j = i + 1; j < dayBlocks.length; j++) {
        if (overlaps(dayBlocks[i]!, dayBlocks[j]!)) {
          out.push({
            kind: 'blocks',
            teacherId,
            date,
            blockAId: dayBlocks[i]!.blockId,
            blockBId: dayBlocks[j]!.blockId,
          });
        }
      }
    }
  }
  return out;
}

/** Hours of held marking time — a block's length counts in full, whatever it overlaps. */
export function reviewHours(occurrences: ReviewBlockOccurrence[]): number {
  return occurrences.reduce((acc, o) => acc + (minutes(o.endTime) - minutes(o.startTime)) / 60, 0);
}
