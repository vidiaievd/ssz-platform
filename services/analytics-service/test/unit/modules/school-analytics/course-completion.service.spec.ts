import { jest } from '@jest/globals';

// Importing the service pulls in `PrismaService` and the generated client, whose
// `import.meta` brings jest down — same stub as the sibling suites.
jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));
jest.unstable_mockModule('../../../../src/modules/projections/course-outline.service.js', () => ({
  CourseOutlineService: class {},
}));

const { CourseCompletionService, completionRatio } = await import(
  '../../../../src/modules/school-analytics/course-completion.service.js'
);

const OUTLINE = [
  { containerId: 'course-a', itemId: 'l1' },
  { containerId: 'course-a', itemId: 'l2' },
  { containerId: 'course-a', itemId: 'shared' },
  { containerId: 'course-a', itemId: 'e1' },
  { containerId: 'course-b', itemId: 'shared' },
  { containerId: 'course-b', itemId: 'e9' },
];

function serviceWith(progress: Array<{ userId: string; contentId: string }>) {
  const ensureFresh = jest.fn(async () => undefined);
  const itemProgress = { findMany: jest.fn(async () => progress) };
  const prisma = {
    courseOutlineItem: { findMany: jest.fn(async () => OUTLINE) },
    itemProgress,
  };
  const service = new CourseCompletionService(prisma as never, { ensureFresh } as never);
  return { service, ensureFresh, itemProgress };
}

describe('completionOf', () => {
  it('counts the published items of each course and what each learner passed in it', async () => {
    const { service, itemProgress } = serviceWith([
      { userId: 'anna', contentId: 'l1' },
      { userId: 'anna', contentId: 'shared' },
      { userId: 'bjorn', contentId: 'e9' },
    ]);

    const result = await service.completionOf(['course-a', 'course-b'], ['anna', 'bjorn']);

    expect(result.get('course-a')?.items).toBe(4);
    expect(result.get('course-b')?.items).toBe(2);
    expect(result.get('course-a')?.passedBy.get('anna')).toBe(2);
    // A lesson in two courses counts towards both.
    expect(result.get('course-b')?.passedBy.get('anna')).toBe(1);
    expect(result.get('course-b')?.passedBy.get('bjorn')).toBe(1);
    expect(result.get('course-a')?.passedBy.has('bjorn')).toBe(false);
    // Only COMPLETED is passed — work with a teacher is not.
    expect(itemProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('fills the outline of a course read for the first time', async () => {
    const { service, ensureFresh } = serviceWith([]);
    await service.completionOf(['course-a', 'course-b'], ['anna']);
    expect(ensureFresh).toHaveBeenCalledWith('course-a');
    expect(ensureFresh).toHaveBeenCalledWith('course-b');
  });

  it('leaves a course without an outline at zero items — unknown, not empty', async () => {
    const { service } = serviceWith([]);
    const result = await service.completionOf(['course-x'], ['anna']);
    expect(result.get('course-x')).toEqual({ items: 0, passedBy: new Map() });
  });

  it('asks for no progress without learners', async () => {
    const { service, itemProgress } = serviceWith([]);
    await service.completionOf(['course-a'], []);
    expect(itemProgress.findMany).not.toHaveBeenCalled();
  });
});

describe('completionRatio', () => {
  it('rounds to hundredths and never passes 1', () => {
    expect(completionRatio(1, 3)).toBe(0.33);
    expect(completionRatio(5, 4)).toBe(1);
  });

  it('is 0 for a course with no items known', () => {
    expect(completionRatio(3, 0)).toBe(0);
  });
});
