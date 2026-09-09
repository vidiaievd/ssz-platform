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
    recipients?: { target: string; recipients: { userId: string; name: string }[] } | null;
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
    escalationRecipientsOf: jest.fn(async () =>
      overrides.recipients === undefined
        ? { target: 'school_admins', recipients: [{ userId: 'admin-1', name: 'Ola' }] }
        : overrides.recipients,
    ),
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

    // Two messages, to two different people about the same late work: the teacher who can
    // mark it, and the school that asked to hear when nobody did.
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

describe('ReviewDigestService — the school threshold and the weekly summary', () => {
  const late = [{ groupId: 'g1', containerId: 'course-1', submittedAt: hoursAgo(60) }];

  /** 47.5: the school itself hears about work its teachers left standing. */
  it('tells whoever the school named when its queue is past the promise', async () => {
    const { service, notifications } = makeService({ pending: late });

    await service.runEscalation(NOW);

    const recipients = notifications.create.mock.calls.map((call) => call[0]!.recipientId);
    expect(recipients).toContain('kari');
    expect(recipients).toContain('admin-1');
    const toSchool = notifications.create.mock.calls
      .map((call) => call[0]!)
      .find((created) => created.recipientId === 'admin-1')!;
    expect(toSchool.templateData).toMatchObject({ scope: 'school', target: 'school_admins' });
  });

  it('leaves the school alone while its queue is on time', async () => {
    const { service, notifications, directory } = makeService({
      pending: [{ groupId: 'g1', containerId: 'course-1', submittedAt: hoursAgo(5) }],
    });

    await service.runEscalation(NOW);

    expect(directory.escalationRecipientsOf).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  /**
   * The setting can point at nobody — a school escalating to an owner it does not have.
   * That is an answer, and it means nobody is written to, not that somebody else is.
   */
  it('writes to nobody when the school named nobody', async () => {
    const { service, notifications } = makeService({
      pending: late,
      recipients: { target: 'owner', recipients: [] },
    });

    await service.runEscalation(NOW);

    expect(
      notifications.create.mock.calls.map((call) => call[0]!.recipientId),
    ).toEqual(['kari']);
  });

  it('sends the weekly picture even when nothing is late', async () => {
    const { service, notifications } = makeService({
      pending: [{ groupId: 'g1', containerId: 'course-1', submittedAt: hoursAgo(5) }],
    });

    await service.runSchoolSummary(NOW);

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0]![0]).toMatchObject({
      recipientId: 'admin-1',
      type: NotificationType.REVIEW_SCHOOL_SUMMARY,
      templateData: expect.objectContaining({ pending: 1, overdue: 0, oldestAgeHours: 5 }),
    });
  });

  /** A weekly message about an empty queue teaches its reader to ignore these. */
  it('says nothing about a school with an empty queue', async () => {
    const { service, notifications } = makeService({ pending: [] });

    await service.runSchoolSummary(NOW);

    expect(notifications.create).not.toHaveBeenCalled();
  });
});
