// The calculator imports PrismaService by value; the generated client does not load
// under jest, and these tests never reach the database.
jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({ PrismaService: class {} }));

import { WorkloadCalculatorService } from './workload-calculator.service.js';
import { ReviewBlock } from '../../../review-blocks/domain/entities/review-block.entity.js';
import type { Lesson } from '../../../slots/domain/entities/lesson.entity.js';
import type { ILessonRepository } from '../../../slots/domain/repositories/lesson.repository.interface.js';
import type { IReviewBlockRepository } from '../../../review-blocks/domain/repositories/review-block.repository.interface.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const lesson = (id: string, date: string, startTime: string, endTime: string) =>
  ({ id, groupId: 'g1', schoolId: 's1', teacherId: 't1', date: d(date), startTime, endTime, status: 'scheduled' }) as unknown as Lesson;

// Tuesdays from 2026-10-27, 16:00–17:30.
const weekly = new ReviewBlock(
  'b1', 's1', 't1', 'weekly', d('2026-10-27'), null, '16:00', '17:30', null, 't1', d('2026-10-01'), d('2026-10-01'),
);

function calculator(lessons: Lesson[], blocks: ReviewBlock[]) {
  const lessonRepo = {
    findBySchoolAndDateRange: jest.fn(async () => lessons),
    findByTeacherAndDateRange: jest.fn(async () => lessons),
  } as unknown as ILessonRepository;
  const blockRepo = {
    findForSchool: jest.fn(async () => blocks),
    findForTeacher: jest.fn(async () => blocks),
  } as unknown as IReviewBlockRepository;
  return new WorkloadCalculatorService(lessonRepo, blockRepo, {} as PrismaService);
}

const policy = { prepFactor: 0.3, dailyContactCap: 6, maxConsecutive: 3, nearCapRatio: 0.85 };

describe('WorkloadCalculatorService with review blocks', () => {
  it('lists a block running into a lesson beside the lesson clashes, with its kind', async () => {
    const conflicts = await calculator(
      [lesson('l1', '2026-10-27', '17:00', '18:00'), lesson('l2', '2026-10-27', '17:30', '18:30')],
      [weekly],
    ).getConflicts('s1', d('2026-10-26'), d('2026-11-01'));

    expect(conflicts).toEqual([
      { kind: 'lessons', teacherId: 't1', date: '2026-10-27', lessonAId: 'l1', lessonBId: 'l2', blockAId: null, blockBId: null },
      { kind: 'block_lesson', teacherId: 't1', date: '2026-10-27', lessonAId: 'l1', lessonBId: null, blockAId: 'b1', blockBId: null },
    ]);
  });

  it('adds held marking time to the effective load and keeps it out of the daily peak', async () => {
    const load = await calculator([lesson('l1', '2026-10-28', '09:00', '15:00')], [weekly]).getTeacherLoad(
      't1',
      d('2026-10-26'),
      d('2026-11-08'),
      policy,
    );

    // Two Tuesdays of 1.5 h each in the fortnight.
    expect(load.reviewHours).toBeCloseTo(3);
    expect(load.effectiveHours).toBeCloseTo(6 + (6 * 0.3 + 1) + 3);
    expect(load.dailyPeak).toBe(6);
  });
});
