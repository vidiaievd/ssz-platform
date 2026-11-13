import { fillDays, resolvePeriod } from './admin-stats.js';

const NOW = new Date('2026-11-09T22:30:00Z');

describe('resolvePeriod', () => {
  it('defaults to the last 30 UTC days, today included', () => {
    const r = resolvePeriod(undefined, undefined, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(r.period.days).toHaveLength(30);
    expect(r.period.days[0]).toBe('2026-10-11');
    expect(r.period.days[29]).toBe('2026-11-09');
    expect(r.period.start.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(r.period.end.toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });

  it('takes both ends inclusive; one day is a period of its own', () => {
    const r = resolvePeriod('2026-11-01', '2026-11-01', NOW);
    expect(r.ok && r.period.days).toEqual(['2026-11-01']);
  });

  it('counts 30 days back from a given `to`', () => {
    const r = resolvePeriod(undefined, '2026-03-01', NOW);
    expect(r.ok && r.period.days[0]).toBe('2026-01-31');
  });

  it('crosses a month and a leap day without losing one', () => {
    const r = resolvePeriod('2028-02-27', '2028-03-01', NOW);
    expect(r.ok && r.period.days).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  });

  it.each([
    ['2026-11-9', undefined],
    ['2026-02-30', undefined],
    ['2026-11-09T00:00:00Z', undefined],
    [undefined, 'yesterday'],
  ])('refuses %s / %s as a date', (from, to) => {
    expect(resolvePeriod(from, to, NOW).ok).toBe(false);
  });

  it('refuses `from` after `to`', () => {
    expect(resolvePeriod('2026-11-02', '2026-11-01', NOW)).toEqual({ ok: false, error: '`from` must not be after `to`' });
  });

  it('admits 366 days and refuses 367', () => {
    expect(resolvePeriod('2027-11-10', '2028-11-09', NOW).ok).toBe(true);
    expect(resolvePeriod('2027-11-09', '2028-11-09', NOW).ok).toBe(false);
  });
});

describe('fillDays', () => {
  it('lays every day out in order, zeros where nothing happened', () => {
    expect(
      fillDays(['2026-11-01', '2026-11-02', '2026-11-03'], {
        schools: [{ day: '2026-11-03', count: 1 }],
        students: [{ day: '2026-11-01', count: 4 }],
        teachers: [],
      }),
    ).toEqual([
      { date: '2026-11-01', schools: 0, students: 4, teachers: 0 },
      { date: '2026-11-02', schools: 0, students: 0, teachers: 0 },
      { date: '2026-11-03', schools: 1, students: 0, teachers: 0 },
    ]);
  });
});
