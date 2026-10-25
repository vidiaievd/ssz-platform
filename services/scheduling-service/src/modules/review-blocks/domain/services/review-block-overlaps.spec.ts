import { findReviewBlockOverlaps, reviewHours, type TimedLesson } from './review-block-overlaps.js';
import type { ReviewBlockOccurrence } from '../entities/review-block.entity.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const sitting = (blockId: string, startTime: string, endTime: string, over: Partial<ReviewBlockOccurrence> = {}) => ({
  blockId,
  schoolId: 's1',
  teacherId: 't1',
  repeat: 'weekly' as const,
  date: d('2026-10-27'),
  startTime,
  endTime,
  note: null,
  ...over,
});

const lesson = (id: string, startTime: string, endTime: string, over: Partial<TimedLesson> = {}): TimedLesson => ({
  id,
  teacherId: 't1',
  date: d('2026-10-27'),
  startTime,
  endTime,
  status: 'scheduled',
  ...over,
});

describe('findReviewBlockOverlaps', () => {
  it('reports a block running into a lesson of the same teacher that day', () => {
    expect(findReviewBlockOverlaps([sitting('b1', '16:00', '17:30')], [lesson('l1', '17:00', '18:00')])).toEqual([
      { kind: 'block_lesson', teacherId: 't1', date: '2026-10-27', blockId: 'b1', lessonId: 'l1' },
    ]);
  });

  it('lets a block end where a lesson starts', () => {
    expect(findReviewBlockOverlaps([sitting('b1', '16:00', '17:00')], [lesson('l1', '17:00', '18:00')])).toEqual([]);
  });

  it("ignores cancelled lessons, unassigned ones, other teachers' and other days'", () => {
    const lessons = [
      lesson('cancelled', '16:00', '17:00', { status: 'cancelled' }),
      lesson('nobody', '16:00', '17:00', { teacherId: null }),
      lesson('colleague', '16:00', '17:00', { teacherId: 't2' }),
      lesson('tomorrow', '16:00', '17:00', { date: d('2026-10-28') }),
    ];
    expect(findReviewBlockOverlaps([sitting('b1', '16:00', '17:30')], lessons)).toEqual([]);
  });

  it('reports two blocks overlapping each other once', () => {
    expect(
      findReviewBlockOverlaps([sitting('b1', '16:00', '17:30'), sitting('b2', '17:00', '18:00')], []),
    ).toEqual([{ kind: 'blocks', teacherId: 't1', date: '2026-10-27', blockAId: 'b1', blockBId: 'b2' }]);
  });
});

describe('reviewHours', () => {
  it('adds up the length of every sitting', () => {
    expect(reviewHours([sitting('b1', '16:00', '17:30'), sitting('b2', '09:00', '09:45')])).toBeCloseTo(2.25);
  });
});
