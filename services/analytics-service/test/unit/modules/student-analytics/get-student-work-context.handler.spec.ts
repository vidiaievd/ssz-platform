import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetStudentWorkContextHandler } = await import(
  '../../../../src/modules/student-analytics/queries/get-student-work-context.handler.js'
);
const { GetStudentWorkContextQuery } = await import(
  '../../../../src/modules/student-analytics/queries/student-analytics.queries.js'
);
const { WorkContextService } = await import(
  '../../../../src/modules/group-analytics/work-context.service.js'
);

const STUDENT = 'anna';
const COURSE = 'c1';

const attempt = (over: Record<string, unknown> = {}) => ({
  userId: STUDENT,
  workContext: 'homework',
  passed: true,
  ratingApplied: 'GOOD',
  answerMode: 'free',
  bankSize: null,
  wordsConsumed: false,
  templateCode: 'gap_fill',
  gapPosition: null,
  ...over,
});

function handlerFor(rows: unknown[], unattributed = 0) {
  const prisma = {
    attemptEvidence: {
      findMany: async () => rows,
      count: async () => unattributed,
    },
  };
  // The real service, not a stub: the whole point of the endpoint is that the learner's
  // bar is counted by the same code as the group's.
  const workContext = new WorkContextService(prisma as never);
  const access = { assertMayRead: async () => undefined };

  return new GetStudentWorkContextHandler(access as never, workContext as never);
}

const query = new GetStudentWorkContextQuery(STUDENT, 'teacher', COURSE);

describe('where one learner’s work happens', () => {
  it('always answers with all four buckets, classwork included and empty', async () => {
    const result = await handlerFor([]).execute(query);

    expect(result.buckets.map((bucket) => bucket.key)).toEqual([
      'homework',
      'self_study',
      'classwork',
      null,
    ]);
    expect(result.buckets.every((bucket) => bucket.attempts === 0)).toBe(true);
  });

  it('keeps attempts nobody labelled in their own bucket, not in self-study', async () => {
    const result = await handlerFor([
      attempt(),
      attempt({ workContext: null }),
      attempt({ workContext: 'something-older' }),
    ]).execute(query);

    const unsaid = result.buckets.find((bucket) => bucket.key === null);
    expect(unsaid?.attempts).toBe(2);
    expect(result.buckets.find((bucket) => bucket.key === 'self_study')?.attempts).toBe(0);
    // The shares still add up to the attempts really made.
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.attempts, 0)).toBe(3);
  });

  it('reports attempts it could not attribute to a course rather than hiding them', async () => {
    // A learner with eighty attempts from before the column existed and an empty bar
    // must not read as a learner who has done nothing.
    const result = await handlerFor([], 86).execute(query);

    expect(result.unattributed).toBe(86);
    expect(result.buckets.every((bucket) => bucket.attempts === 0)).toBe(true);
  });
});
