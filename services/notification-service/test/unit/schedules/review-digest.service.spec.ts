import { ReviewDigestService } from '../../../src/modules/notifications/schedules/review-digest.service.js';
import { NotificationType } from '../../../generated/prisma/enums.js';

const NOW = new Date('2026-08-20T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

/**
 * `dueThisHour` reads the local hour, so a test that hard-codes a UTC instant would pass
 * or fail depending on where it runs. This is the same instant in the runner's own zone.
 */
const onTheDigestHour = () => {
  const at = new Date(NOW);
  at.setHours(12, 0, 0, 0);
  return at;
};

function makeService(
  overrides: {
    schools?: { schoolId: string }[] | null;
    pending?: { groupId: string | null; containerId: string | null; submittedAt: Date }[] | null;
    reviewers?: { groupId: string; teachers: { userId: string; name: string }[] }[] | null;
    settings?: { respondWithinHours: number; escalateAfterHours: number; escalateTo: string } | null;
    states?: Map<string, { lastMaxSubmittedAt: Date; lastEscalatedAt: Date | null }>;
    enabled?: boolean;
  } = {},
) {
  const load = {
    configured: true,
    schoolsWithPendingWork: jest.fn(async () =>
      overrides.schools === undefined ? [{ schoolId: 'school-1' }] : overrides.schools,
    ),
    pendingSubmissions: jest.fn(async () =>
      overrides.pending === undefined
        ? [{ groupId: 'g1', containerId: 'course-1', submittedAt: hoursAgo(5) }]
        : overrides.pending,
    ),
  };
  const directory = {
    configured: true,
    reviewersOf: jest.fn(async () =>
      overrides.reviewers === undefined
        ? [{ groupId: 'g1', teachers: [{ userId: 'kari', name: 'Kari' }] }]
        : overrides.reviewers,
    ),
    settingsOf: jest.fn(async () =>
      overrides.settings === undefined
        ? { respondWithinHours: 48, escalateAfterHours: 48, escalateTo: 'school_admins' }
        : overrides.settings,
    ),
  };
  const state = {
    load: jest.fn(async () => overrides.states ?? new Map()),
    recordDigest: jest.fn(async () => undefined),
    recordEscalation: jest.fn(async () => undefined),
  };
  // Typed with its argument so that the assertions below can read what was written; a
  // zero-arg mock would make `mock.calls[0][0]` a type error rather than a check.
  const notifications = {
    create: jest.fn(async (_data: Record<string, unknown>) => undefined),
  };
  const config = {
    get: jest.fn(() => ({
      digestEnabled: overrides.enabled ?? true,
      digestIntervalHours: 6,
      exerciseServiceUrl: 'http://engine',
      organizationServiceUrl: 'http://org',
      internalToken: 'token',
    })),
  };

  const service = new ReviewDigestService(
    load as never,
    directory as never,
    state as never,
    notifications as never,
    config as never,
  );
  return { service, load, directory, state, notifications };
}

describe('ReviewDigestService — the digest run', () => {
  it('writes one teacher one message and records what they were told', async () => {
    const { service, notifications, state } = makeService();

    await service.runDigest(onTheDigestHour());

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0]![0]).toMatchObject({
      recipientId: 'kari',
      type: NotificationType.REVIEW_DIGEST,
      templateData: expect.objectContaining({ schoolId: 'school-1', pending: 1 }),
    });
    // The mark the next run compares against — written after the message, never before.
    expect(state.recordDigest).toHaveBeenCalledWith('kari', hoursAgo(5), expect.any(Date));
  });

  it('does nothing at all when the job is switched off', async () => {
    const { service, load, notifications } = makeService({ enabled: false });

    await service.runDigest(onTheDigestHour());

    expect(load.schoolsWithPendingWork).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  /** Six-hour interval, anchored to midnight: 00, 06, 12, 18 and no other hour. */
  it('stands aside on the hours that are not its own', async () => {
    const { service, load } = makeService();
    const offHour = onTheDigestHour();
    offHour.setHours(13);

    await service.runDigest(offHour);

    expect(load.schoolsWithPendingWork).not.toHaveBeenCalled();
  });

  it('writes to nobody when no school has anything waiting', async () => {
    const { service, notifications, directory } = makeService({ schools: [] });

    await service.runDigest(onTheDigestHour());

    expect(directory.reviewersOf).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  /**
   * The rule that runs through every client: an answer this run could not get is not
   * evidence that nothing is waiting, and must never be reported as one.
   */
  it('says nothing when the engine does not answer', async () => {
    const { service, notifications } = makeService({ schools: null });

    await service.runDigest(onTheDigestHour());

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('says nothing when the directory cannot say who reviews the work', async () => {
    const { service, notifications, state } = makeService({ reviewers: null });

    await service.runDigest(onTheDigestHour());

    expect(notifications.create).not.toHaveBeenCalled();
    expect(state.recordDigest).not.toHaveBeenCalled();
  });

  it('leaves the teacher alone when nothing has arrived since their last digest', async () => {
    const { service, notifications } = makeService({
      states: new Map([['kari', { lastMaxSubmittedAt: hoursAgo(5), lastEscalatedAt: null }]]),
    });

    await service.runDigest(onTheDigestHour());

    expect(notifications.create).not.toHaveBeenCalled();
  });
});

describe('ReviewDigestService — the daily escalation', () => {
  it('tells a teacher when work has been waiting past what the school promised', async () => {
    const { service, notifications, state } = makeService({
      pending: [{ groupId: 'g1', containerId: 'course-1', submittedAt: hoursAgo(60) }],
    });

    await service.runEscalation(NOW);

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0]![0]).toMatchObject({
      recipientId: 'kari',
      type: NotificationType.REVIEW_ESCALATION,
      templateData: expect.objectContaining({ overdue: 1, escalateAfterHours: 48 }),
    });
    expect(state.recordEscalation).toHaveBeenCalledWith('kari', NOW);
  });

  it('keeps quiet while everything is still within the promise', async () => {
    const { service, notifications } = makeService({
      pending: [{ groupId: 'g1', containerId: 'course-1', submittedAt: hoursAgo(5) }],
    });

    await service.runEscalation(NOW);

    expect(notifications.create).not.toHaveBeenCalled();
  });

  /** What counts as late is the school's own number; without it there is no judgement. */
  it('does not invent a deadline when the school settings cannot be read', async () => {
    const { service, notifications } = makeService({
      pending: [{ groupId: 'g1', containerId: 'course-1', submittedAt: hoursAgo(600) }],
      settings: null,
    });

    await service.runEscalation(NOW);

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('runs on any hour, unlike the digest', async () => {
    const { service, load } = makeService({
      pending: [{ groupId: 'g1', containerId: 'course-1', submittedAt: hoursAgo(60) }],
    });
    const oddHour = new Date(NOW);
    oddHour.setHours(13);

    await service.runEscalation(oddHour);

    expect(load.schoolsWithPendingWork).toHaveBeenCalled();
  });
});
