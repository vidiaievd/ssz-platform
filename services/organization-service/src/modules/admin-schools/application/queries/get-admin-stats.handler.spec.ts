import { jest } from '@jest/globals';
import { resolvePeriod, type AdminStatsSnapshot } from '../../domain/admin-stats.js';
import { GetAdminStatsHandler } from './get-admin-stats.handler.js';
import { GetAdminStatsQuery } from './get-admin-stats.query.js';

const period = (() => {
  const r = resolvePeriod('2026-11-01', '2026-11-03', new Date());
  if (!r.ok) throw new Error(r.error);
  return r.period;
})();

const snapshot: AdminStatsSnapshot = {
  schools: [
    { kind: 'SCHOOL', status: 'active', count: 5 },
    { kind: 'SOLO', status: 'active', count: 3 },
    { kind: 'SCHOOL', status: 'deleted', count: 1 },
  ],
  studentsTotal: 40,
  teachersTotal: 9,
  daily: {
    schools: [{ day: '2026-11-02', count: 2 }],
    students: [
      { day: '2026-11-01', count: 3 },
      { day: '2026-11-03', count: 4 },
    ],
    teachers: [{ day: '2026-11-03', count: 1 }],
  },
};

describe('GetAdminStatsHandler', () => {
  const reader = { snapshot: jest.fn<() => Promise<AdminStatsSnapshot>>().mockResolvedValue(snapshot) };
  const handler = new GetAdminStatsHandler(reader as never);

  it('asks for the whole period, end exclusive', async () => {
    await handler.execute(new GetAdminStatsQuery(period));
    expect(reader.snapshot).toHaveBeenCalledWith(
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-04T00:00:00.000Z'),
    );
  });

  it('folds the rows into status and kind, statuses absent from the data as zero', async () => {
    const stats = await handler.execute(new GetAdminStatsQuery(period));
    expect(stats.schools).toEqual({
      total: 9,
      byStatus: { active: 8, inactive: 0, deleted: 1 },
      byKind: { SCHOOL: 6, SOLO: 3 },
      createdInPeriod: 2,
    });
  });

  it('sums the period from the same daily series it answers', async () => {
    const stats = await handler.execute(new GetAdminStatsQuery(period));
    expect(stats).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-03',
      students: { total: 40, newInPeriod: 7 },
      teachers: { total: 9, newInPeriod: 1 },
    });
    expect(stats.daily.map((d) => d.students)).toEqual([3, 0, 4]);
  });
});
