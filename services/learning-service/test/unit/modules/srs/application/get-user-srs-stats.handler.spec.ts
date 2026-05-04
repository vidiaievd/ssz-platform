import { jest } from '@jest/globals';
import { GetUserSrsStatsHandler } from '../../../../../src/modules/srs/application/queries/get-user-srs-stats.handler.js';
import { GetUserSrsStatsQuery } from '../../../../../src/modules/srs/application/queries/get-user-srs-stats.query.js';
import type { ISrsRepository, SrsStats } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';

const NOW     = new Date('2026-04-29T10:00:00Z');
const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';

const STATS: SrsStats = {
  newCount:          5,
  learningCount:     2,
  reviewCount:       10,
  relearningCount:   1,
  suspendedCount:    3,
  dueNowCount:       7,
  reviewedTodayCount: 4,
};

function makeHandler() {
  const repo: ISrsRepository = {
    findById:           jest.fn(),
    findByUserAndContent: jest.fn(),
    findDueCards:       jest.fn(),
    save:               jest.fn(),
    countNewToday:      jest.fn(),
    countReviewedToday: jest.fn(),
    getStatsByUser:     jest.fn<() => Promise<SrsStats>>().mockResolvedValue(STATS),
  } as any;
  const clock: IClock = { now: () => NOW };
  return { handler: new GetUserSrsStatsHandler(repo, clock), repo };
}

describe('GetUserSrsStatsHandler', () => {
  it('delegates to repo.getStatsByUser with the correct userId and timestamp', async () => {
    const { handler, repo } = makeHandler();

    await handler.execute(new GetUserSrsStatsQuery(USER_ID));

    expect(repo.getStatsByUser).toHaveBeenCalledWith(USER_ID, NOW);
  });

  it('returns all stat fields from the repository', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(new GetUserSrsStatsQuery(USER_ID));

    expect(result.newCount).toBe(5);
    expect(result.learningCount).toBe(2);
    expect(result.reviewCount).toBe(10);
    expect(result.relearningCount).toBe(1);
    expect(result.suspendedCount).toBe(3);
    expect(result.dueNowCount).toBe(7);
    expect(result.reviewedTodayCount).toBe(4);
  });
});
