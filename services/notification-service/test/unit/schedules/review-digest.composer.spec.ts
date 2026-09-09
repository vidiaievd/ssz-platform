import {
  composeDigests,
  composeEscalations,
  type DigestState,
  type PendingSubmission,
  type ReviewerGroup,
} from '../../../src/modules/notifications/schedules/review-digest.composer.js';

const NOW = new Date('2026-08-19T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

const waiting = (groupId: string | null, hours: number): PendingSubmission => ({
  groupId,
  containerId: 'course-1',
  submittedAt: hoursAgo(hours),
});

const reviewers = (...groups: [string, ...string[]][]): ReviewerGroup[] =>
  groups.map(([groupId, ...teachers]) => ({
    groupId,
    teachers: teachers.map((userId) => ({ userId, name: userId })),
  }));

const states = (entries: Record<string, Partial<DigestState>> = {}): Map<string, DigestState> =>
  new Map(
    Object.entries(entries).map(([userId, state]) => [
      userId,
      { lastMaxSubmittedAt: state.lastMaxSubmittedAt ?? new Date(0), lastEscalatedAt: state.lastEscalatedAt ?? null },
    ]),
  );

describe('composeDigests', () => {
  /** Criterion 41: one learner's lesson-worth of exercises is one message, not twelve. */
  it('folds a whole sitting into one message with a line per group', () => {
    const pending = [waiting('g1', 5), waiting('g1', 4), waiting('g2', 3)];

    const digests = composeDigests('school-1', pending, reviewers(['g1', 'kari'], ['g2', 'kari']), states());

    expect(digests).toHaveLength(1);
    expect(digests[0]).toMatchObject({
      userId: 'kari',
      schoolId: 'school-1',
      pending: 3,
      groups: [
        { groupId: 'g1', pending: 2 },
        { groupId: 'g2', pending: 1 },
      ],
    });
    expect(digests[0]!.oldestSubmittedAt).toEqual(hoursAgo(5));
  });

  it('writes to each teacher of a shared group, and only about their own groups', () => {
    const pending = [waiting('g1', 2), waiting('g2', 2)];

    const digests = composeDigests('school-1', pending, reviewers(['g1', 'kari', 'ola'], ['g2', 'ola']), states());

    const byUser = new Map(digests.map((digest) => [digest.userId, digest]));
    expect(byUser.get('kari')!.pending).toBe(1);
    expect(byUser.get('ola')!.pending).toBe(2);
  });

  /**
   * The dedup rule, and the reason it is a timestamp: between two runs a teacher may mark
   * one submission and receive another, leaving the count untouched while the queue has
   * genuinely changed — and vice versa.
   */
  it('stays quiet when nothing has arrived since the last digest', () => {
    const pending = [waiting('g1', 5)];
    const told = states({ kari: { lastMaxSubmittedAt: hoursAgo(5) } });

    expect(composeDigests('school-1', pending, reviewers(['g1', 'kari']), told)).toEqual([]);
  });

  it('writes again as soon as something newer lands', () => {
    const pending = [waiting('g1', 5), waiting('g1', 1)];
    const told = states({ kari: { lastMaxSubmittedAt: hoursAgo(5) } });

    const digests = composeDigests('school-1', pending, reviewers(['g1', 'kari']), told);

    // The whole queue, not only the new arrival: the message answers "what is waiting on
    // me", which is a number the teacher acts on, not a delta they have to add up.
    expect(digests[0]).toMatchObject({ pending: 2, newestSubmittedAt: hoursAgo(1) });
  });

  it('sends nothing at all when nothing is waiting', () => {
    expect(composeDigests('school-1', [], reviewers(['g1', 'kari']), states())).toEqual([]);
  });

  /**
   * Work whose learner was in no group has no reviewer to name. It is not dropped from
   * the product — oversight shows it as unassigned — but a digest cannot invent someone
   * to send it to, and pretending otherwise would hide that nobody is on it.
   */
  it('writes to nobody about work that belongs to no group', () => {
    expect(composeDigests('school-1', [waiting(null, 9)], reviewers(['g1', 'kari']), states())).toEqual([]);
  });

  it('leaves a group nobody teaches out rather than picking a teacher for it', () => {
    const digests = composeDigests('school-1', [waiting('orphan', 9)], reviewers(['g1', 'kari']), states());

    expect(digests).toEqual([]);
  });
});

describe('composeEscalations', () => {
  const settings = { escalateAfterHours: 48 };

  it('speaks only for work past what the school itself promised', () => {
    const pending = [waiting('g1', 50), waiting('g1', 10)];

    const escalations = composeEscalations('school-1', pending, reviewers(['g1', 'kari']), states(), settings, NOW);

    expect(escalations).toEqual([
      {
        userId: 'kari',
        schoolId: 'school-1',
        overdue: 1,
        oldestSubmittedAt: hoursAgo(50),
        escalateAfterHours: 48,
      },
    ]);
  });

  it('says nothing when everything is still within the promise', () => {
    const pending = [waiting('g1', 10)];

    expect(
      composeEscalations('school-1', pending, reviewers(['g1', 'kari']), states(), settings, NOW),
    ).toEqual([]);
  });

  /** Daily, not every run: a reminder every six hours is a reason to stop reading them. */
  it('escalates to the same teacher at most once a day', () => {
    const pending = [waiting('g1', 50)];
    const told = states({ kari: { lastEscalatedAt: hoursAgo(3) } });

    expect(
      composeEscalations('school-1', pending, reviewers(['g1', 'kari']), told, settings, NOW),
    ).toEqual([]);
  });

  it('escalates again once the day has passed and the work is still there', () => {
    const pending = [waiting('g1', 50)];
    const told = states({ kari: { lastEscalatedAt: hoursAgo(30) } });

    expect(
      composeEscalations('school-1', pending, reviewers(['g1', 'kari']), told, settings, NOW),
    ).toHaveLength(1);
  });

  /**
   * The digest's clock must not silence the escalation: being told what is waiting is a
   * different message from being told it is late.
   */
  it('escalates work that is too old to have produced a digest', () => {
    const pending = [waiting('g1', 50)];
    const told = states({ kari: { lastMaxSubmittedAt: hoursAgo(50) } });

    expect(composeDigests('school-1', pending, reviewers(['g1', 'kari']), told)).toEqual([]);
    expect(
      composeEscalations('school-1', pending, reviewers(['g1', 'kari']), told, settings, NOW),
    ).toHaveLength(1);
  });
});
