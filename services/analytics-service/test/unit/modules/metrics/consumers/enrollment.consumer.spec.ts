import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { EnrollmentConsumer } = await import(
  '../../../../../src/modules/metrics/consumers/enrollment.consumer.js'
);

interface Row {
  enrollmentId: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
  status: string;
  enrolledAt: Date;
  completedAt: Date | null;
  unenrolledAt: Date | null;
}

/** `enrollment_projection`, and nothing else of Postgres. */
function fakePrisma() {
  const rows = new Map<string, Row>();

  return {
    rows,
    prisma: {
      enrollmentProjection: {
        findUnique: async ({ where }: { where: { enrollmentId: string } }) =>
          rows.get(where.enrollmentId) ?? null,
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { enrollmentId: string };
          create: Row;
          update: Partial<Row>;
        }) => {
          const known = rows.get(where.enrollmentId);
          rows.set(where.enrollmentId, known ? { ...known, ...update } : create);
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { enrollmentId: string };
          data: Partial<Row>;
        }) => {
          const known = rows.get(where.enrollmentId);
          if (known) rows.set(where.enrollmentId, { ...known, ...data });
        },
      },
    },
  };
}

const consumerOn = (prisma: unknown) =>
  new (EnrollmentConsumer as any)({ get: () => undefined }, prisma);

const created = (schoolId: string | null, at: string) =>
  [
    'learning.enrollment.created',
    { enrollmentId: 'e-1', userId: 'u-1', containerId: 'c-1', schoolId },
    at,
  ] as const;

describe('EnrollmentConsumer — enrollment_projection', () => {
  it('records a new enrolment with the workspace it names', async () => {
    const db = fakePrisma();

    await (consumerOn(db.prisma) as any).applyEvent(...created('w-1', '2026-09-01T10:00:00Z'));

    expect(db.rows.get('e-1')).toMatchObject({ schoolId: 'w-1', status: 'ACTIVE' });
  });

  // A private tutor's course names no school, so these rows were stored with no workspace
  // at all and the tutor's dashboard counted zero students. The repair reaches the
  // projection as the same event told again — which `update: {}` used to ignore.
  it('takes the workspace from an event told a second time', async () => {
    const db = fakePrisma();
    const consumer = consumerOn(db.prisma);

    await (consumer as any).applyEvent(...created(null, '2026-09-01T10:00:00Z'));
    await (consumer as any).applyEvent(...created('w-1', '2026-09-01T10:00:00Z'));

    expect(db.rows.get('e-1')).toMatchObject({ schoolId: 'w-1', status: 'ACTIVE' });
  });

  it('brings back a learner who came back to the course', async () => {
    const db = fakePrisma();
    const consumer = consumerOn(db.prisma);

    await (consumer as any).applyEvent(...created('w-1', '2026-09-01T10:00:00Z'));
    await (consumer as any).applyEvent(
      'learning.enrollment.unenrolled',
      { enrollmentId: 'e-1', userId: 'u-1', containerId: 'c-1', reason: null },
      '2026-09-02T10:00:00Z',
    );
    await (consumer as any).applyEvent(...created('w-1', '2026-09-03T10:00:00Z'));

    expect(db.rows.get('e-1')).toMatchObject({ status: 'ACTIVE', unenrolledAt: null });
  });

  // A replayed history can arrive behind what it precedes: resurrecting a learner who
  // left is a worse lie than the missing workspace being repaired.
  it('does not resurrect a learner an older event precedes', async () => {
    const db = fakePrisma();
    const consumer = consumerOn(db.prisma);

    await (consumer as any).applyEvent(...created(null, '2026-09-01T10:00:00Z'));
    await (consumer as any).applyEvent(
      'learning.enrollment.unenrolled',
      { enrollmentId: 'e-1', userId: 'u-1', containerId: 'c-1', reason: null },
      '2026-09-02T10:00:00Z',
    );
    await (consumer as any).applyEvent(...created('w-1', '2026-09-01T10:00:00Z'));

    expect(db.rows.get('e-1')).toMatchObject({ status: 'UNENROLLED', schoolId: 'w-1' });
  });

  it('keeps a completed course completed', async () => {
    const db = fakePrisma();
    const consumer = consumerOn(db.prisma);

    await (consumer as any).applyEvent(...created('w-1', '2026-09-01T10:00:00Z'));
    await (consumer as any).applyEvent(
      'learning.enrollment.completed',
      {
        enrollmentId: 'e-1',
        userId: 'u-1',
        containerId: 'c-1',
        schoolId: 'w-1',
        completedAt: '2026-09-05T10:00:00Z',
      },
      '2026-09-05T10:00:00Z',
    );
    await (consumer as any).applyEvent(...created('w-1', '2026-09-01T10:00:00Z'));

    expect(db.rows.get('e-1')).toMatchObject({ status: 'COMPLETED' });
  });
});
