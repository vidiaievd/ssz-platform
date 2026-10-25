import { ReviewTermWarningService } from '../../../src/modules/notifications/schedules/review-term-warning.service.js';
import { NotificationType } from '../../../generated/prisma/enums.js';

const NOW = new Date('2026-10-25T12:00:00Z');
const hoursAhead = (hours: number) => new Date(NOW.getTime() + hours * 60 * 60 * 1000);

function makeService(
  overrides: {
    schools?: { schoolId: string }[] | null;
    terms?: { attemptId: string; groupId: string | null; autoAcceptAt: Date }[] | null;
    reviewers?: { groupId: string; teachers: { userId: string; name: string }[] }[] | null;
    told?: { attemptId: string; userId: string }[];
    enabled?: boolean;
  } = {},
) {
  const load = {
    configured: true,
    schoolsWithPendingWork: jest.fn(async () =>
      overrides.schools === undefined ? [{ schoolId: 'school-1' }] : overrides.schools,
    ),
    termsAhead: jest.fn(async (_schoolId: string, _hours: number) =>
      overrides.terms === undefined
        ? [{ attemptId: 'a1', groupId: 'g1', autoAcceptAt: hoursAhead(20) }]
        : overrides.terms,
    ),
  };
  const directory = {
    configured: true,
    reviewersOf: jest.fn(async () =>
      overrides.reviewers === undefined
        ? [{ groupId: 'g1', teachers: [{ userId: 'kari', name: 'Kari' }] }]
        : overrides.reviewers,
    ),
  };
  const notifications = {
    create: jest.fn(async (_data: Record<string, unknown>) => undefined),
  };
  const prisma = {
    reviewTermWarning: {
      deleteMany: jest.fn(async (_args: unknown) => ({ count: 0 })),
      findMany: jest.fn(async (_args: unknown) => overrides.told ?? []),
      createMany: jest.fn(async (_args: { data: unknown[] }) => ({ count: 1 })),
    },
  };
  const config = {
    get: jest.fn(() => ({
      digestEnabled: overrides.enabled ?? true,
      digestIntervalHours: 6,
      termWarningHours: 24,
      exerciseServiceUrl: 'http://engine',
      organizationServiceUrl: 'http://org',
      internalToken: 'token',
    })),
  };

  const service = new ReviewTermWarningService(
    load as never,
    directory as never,
    notifications as never,
    prisma as never,
    config as never,
  );
  return { service, load, directory, notifications, prisma };
}

describe('ReviewTermWarningService', () => {
  it('warns the teacher once and records every submission it named', async () => {
    const { service, notifications, prisma, load } = makeService();

    const sent = await service.run(NOW);

    expect(sent).toBe(1);
    expect(load.termsAhead).toHaveBeenCalledWith('school-1', 24);
    expect(notifications.create.mock.calls[0]![0]).toMatchObject({
      recipientId: 'kari',
      type: NotificationType.REVIEW_TERM_WARNING,
      templateKey: 'review_term_warning',
      templateData: {
        schoolId: 'school-1',
        expiring: 1,
        withinHours: 24,
        earliestAutoAcceptAt: hoursAhead(20).toISOString(),
        groups: [{ groupId: 'g1', pending: 1 }],
      },
    });
    expect(prisma.reviewTermWarning.createMany.mock.calls[0]![0].data).toEqual([
      { attemptId: 'a1', userId: 'kari' },
    ]);
  });

  it('stays quiet on a rerun', async () => {
    const { service, notifications } = makeService({ told: [{ attemptId: 'a1', userId: 'kari' }] });

    expect(await service.run(NOW)).toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('does nothing at all when the digest is switched off', async () => {
    const { service, load, notifications } = makeService({ enabled: false });

    await service.run(NOW);

    expect(load.schoolsWithPendingWork).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('says nothing when the engine cannot list the terms', async () => {
    const { service, notifications, directory } = makeService({ terms: null });

    await service.run(NOW);

    expect(directory.reviewersOf).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('says nothing when the directory cannot say who reviews the work', async () => {
    const { service, notifications } = makeService({ reviewers: null });

    await service.run(NOW);

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('sweeps warnings whose terms are long past', async () => {
    const { service, prisma } = makeService({ terms: [] });

    await service.run(NOW);

    expect(prisma.reviewTermWarning.deleteMany).toHaveBeenCalledWith({
      where: { sentAt: { lt: new Date('2026-10-11T12:00:00Z') } },
    });
  });
});
