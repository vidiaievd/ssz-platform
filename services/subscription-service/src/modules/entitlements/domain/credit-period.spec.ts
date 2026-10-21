import { addCredits } from './credits.js';
import { creditPeriod } from './credit-period.js';

const d = (iso: string) => new Date(iso);

describe('creditPeriod', () => {
  it('uses the calendar month (UTC) without an anchor', () => {
    expect(creditPeriod(null, d('2026-10-21T12:00:00Z'))).toEqual({
      start: d('2026-10-01T00:00:00Z'),
      end: d('2026-11-01T00:00:00Z'),
    });
  });

  it('runs monthly cycles from the anchor', () => {
    const anchor = d('2026-08-15T10:00:00Z');
    expect(creditPeriod(anchor, d('2026-10-21T00:00:00Z'))).toEqual({
      start: d('2026-10-15T10:00:00Z'),
      end: d('2026-11-15T10:00:00Z'),
    });
    // Before the anchor's day in the month: still the previous cycle.
    expect(creditPeriod(anchor, d('2026-10-15T09:59:59Z'))).toEqual({
      start: d('2026-09-15T10:00:00Z'),
      end: d('2026-10-15T10:00:00Z'),
    });
  });

  it('is the first cycle on the day the subscription starts', () => {
    const anchor = d('2026-10-21T08:00:00Z');
    expect(creditPeriod(anchor, anchor)).toEqual({ start: anchor, end: d('2026-11-21T08:00:00Z') });
  });

  it('clamps the 31st to short months and comes back to it', () => {
    const anchor = d('2026-01-31T00:00:00Z');
    expect(creditPeriod(anchor, d('2026-02-28T12:00:00Z'))).toEqual({
      start: d('2026-02-28T00:00:00Z'),
      end: d('2026-03-31T00:00:00Z'),
    });
    expect(creditPeriod(anchor, d('2026-03-31T00:00:00Z')).start).toEqual(d('2026-03-31T00:00:00Z'));
  });

  it('crosses the year', () => {
    expect(creditPeriod(d('2026-11-20T00:00:00Z'), d('2027-01-05T00:00:00Z'))).toEqual({
      start: d('2026-12-20T00:00:00Z'),
      end: d('2027-01-20T00:00:00Z'),
    });
  });

  it('ends the last cycle where the subscription ends', () => {
    expect(creditPeriod(d('2026-10-01T00:00:00Z'), d('2026-10-21T00:00:00Z'), d('2026-10-25T00:00:00Z'))).toEqual({
      start: d('2026-10-01T00:00:00Z'),
      end: d('2026-10-25T00:00:00Z'),
    });
  });
});

describe('addCredits', () => {
  it('adds decimals exactly and drops trailing zeros', () => {
    expect(addCredits('1000', '200')).toBe('1200');
    expect(addCredits('0.1', '0.2')).toBe('0.3');
    expect(addCredits('20.500000', '0.000001')).toBe('20.500001');
    expect(addCredits('999999999999.999999', '0.000001')).toBe('1000000000000');
  });
});
