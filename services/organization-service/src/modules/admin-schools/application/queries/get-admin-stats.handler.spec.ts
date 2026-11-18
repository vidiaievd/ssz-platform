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
    { kind: 'SCHOOL', status: 'closed', count: 1 },
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
  seats: {
    used: 300,
    limit: 400,
    schoolsLimited: 3,
    attention: [
      { schoolId: 'a', name: 'A', slug: 'a', used: 12, limit: 10, over: true },
      { schoolId: 'b', name: 'B', slug: 'b', used: 95, limit: 100, over: false },
      { schoolId: 'c', name: 'C', slug: 'c', used: 9, limit: 10, over: false },
    ],
  },
  lifecycle: {
    closingSoon: [{ schoolId: 'd', name: 'D', slug: 'd', kind: 'SCHOOL', at: new Date('2026-11-05') }],
    purgingSoon: Array.from({ length: 101 }, (_, i) => ({
      schoolId: `p${i}`,
      name: `P${i}`,
      slug: `p${i}`,
      kind: 'SOLO' as const,
      at: new Date('2026-11-06'),
    })),
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
      expect.any(Date),
    );
  });

  it('folds the rows into status and kind, statuses absent from the data as zero', async () => {
    const stats = await handler.execute(new GetAdminStatsQuery(period));
    expect(stats.schools).toEqual({
      total: 9,
      byStatus: { active: 8, suspended: 0, closed: 1, purged: 0 },
      byKind: { SCHOOL: 6, SOLO: 3 },
      createdInPeriod: 2,
    });
  });

  it('caps the lifecycle lists at 100, soonest first as read, with the full total', async () => {
    const { lifecycle } = await handler.execute(new GetAdminStatsQuery(period));
    expect(lifecycle.closingSoon).toEqual({ total: 1, items: snapshot.lifecycle.closingSoon, truncated: false });
    expect(lifecycle.purgingSoon.total).toBe(101);
    expect(lifecycle.purgingSoon.items).toHaveLength(100);
    expect(lifecycle.purgingSoon.items[0].schoolId).toBe('p0');
    expect(lifecycle.purgingSoon.truncated).toBe(true);
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

  it('splits the attention rows into near and over, and caps each list', async () => {
    const stats = await handler.execute(new GetAdminStatsQuery(period));
    expect(stats.seats).toMatchObject({ used: 300, limit: 400, schoolsLimited: 3 });
    expect(stats.seats.over).toEqual({
      total: 1,
      items: [{ schoolId: 'a', name: 'A', slug: 'a', used: 12, limit: 10 }],
      truncated: false,
    });
    expect(stats.seats.near.items.map((i) => i.schoolId)).toEqual(['b', 'c']);

    const many = Array.from({ length: 101 }, (_, i) => ({
      schoolId: `s${i}`, name: 'S', slug: 's', used: 10, limit: 10, over: false,
    }));
    reader.snapshot.mockResolvedValueOnce({ ...snapshot, seats: { ...snapshot.seats, attention: many } });
    const capped = await handler.execute(new GetAdminStatsQuery(period));
    expect(capped.seats.near).toMatchObject({ total: 101, truncated: true });
    expect(capped.seats.near.items).toHaveLength(100);
  });
});
