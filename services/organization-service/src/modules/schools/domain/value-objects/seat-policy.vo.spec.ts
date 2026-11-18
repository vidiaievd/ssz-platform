import { admitOneStudent, seatCeiling, seatUsage } from './seat-policy.vo.js';

describe('seat policy (plan 90, phase 4)', () => {
  it('gives a grace of ceil(10 %) over the limit', () => {
    expect(seatCeiling(5)).toBe(6);
    expect(seatCeiling(30)).toBe(33);
    expect(seatCeiling(100)).toBe(110);
    expect(seatCeiling(0)).toBe(0);
  });

  it('admits up to the limit without a warning', () => {
    expect(admitOneStudent(99, 100)).toEqual({
      admitted: true,
      seats: { used: 100, limit: 100, ceiling: 110, state: 'ok' },
    });
  });

  it('admits into the grace with a warning, and says when the last seat is gone', () => {
    expect(admitOneStudent(100, 100).seats.state).toBe('warning');
    expect(admitOneStudent(108, 100)).toEqual({
      admitted: true,
      seats: { used: 109, limit: 100, ceiling: 110, state: 'warning' },
    });
    expect(admitOneStudent(109, 100)).toEqual({
      admitted: true,
      seats: { used: 110, limit: 100, ceiling: 110, state: 'full' },
    });
  });

  it('refuses at the ceiling and reports the roster as it is', () => {
    expect(admitOneStudent(110, 100)).toEqual({
      admitted: false,
      seats: { used: 110, limit: 100, ceiling: 110, state: 'full' },
    });
    expect(admitOneStudent(6, 5).admitted).toBe(false);
  });

  it('keeps refusing a roster already beyond the ceiling (a lowered limit removes nobody)', () => {
    expect(admitOneStudent(40, 5)).toEqual({
      admitted: false,
      seats: { used: 40, limit: 5, ceiling: 6, state: 'full' },
    });
  });

  it('admits anyone when there is no limit', () => {
    expect(admitOneStudent(10_000, null)).toEqual({
      admitted: true,
      seats: { used: 10_001, limit: null, ceiling: null, state: 'ok' },
    });
  });

  it('a zero limit refuses the first learner', () => {
    expect(admitOneStudent(0, 0).admitted).toBe(false);
  });

  it('describes a roster without admitting anyone', () => {
    expect(seatUsage(87, 100)).toEqual({ used: 87, limit: 100, ceiling: 110, state: 'ok' });
    expect(seatUsage(105, 100).state).toBe('warning');
  });
});
