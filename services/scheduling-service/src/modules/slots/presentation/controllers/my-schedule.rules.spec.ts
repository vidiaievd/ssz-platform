import { parseRange, resolveScheduleTarget } from './my-schedule.rules.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';

const TUTOR = 'tutor-1';

const user = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: TUTOR,
  roles: ['tutor'],
  isPlatformAdmin: false,
  ...over,
});

describe('whose schedule', () => {
  it('reads "me" as the caller, so a screen need not know its own user id', () => {
    expect(resolveScheduleTarget('me', user())).toBe(TUTOR);
  });

  it('lets a teacher ask for themselves by id', () => {
    expect(resolveScheduleTarget(TUTOR, user())).toBe(TUTOR);
  });

  it("refuses somebody else's schedule", () => {
    expect(() => resolveScheduleTarget('another-teacher', user())).toThrow(
      'You can only read your own schedule',
    );
  });

  it('lets a platform admin look, since they already see everything', () => {
    expect(resolveScheduleTarget('another-teacher', user({ isPlatformAdmin: true }))).toBe(
      'another-teacher',
    );
  });
});

describe('the window', () => {
  it('takes a single day, from and to alike', () => {
    const range = parseRange('2026-09-17', '2026-09-17');

    expect(range.from.toISOString()).toBe('2026-09-17T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-09-17T00:00:00.000Z');
  });

  it('reads the dates as UTC midnights, matching the column', () => {
    const range = parseRange('2026-09-14', '2026-09-20');

    expect(range.from.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-09-20T00:00:00.000Z');
  });

  it.each([
    ['', '2026-09-20'],
    ['2026-09-14', ''],
    ['not-a-date', '2026-09-20'],
  ])('refuses a range that is not two dates (%s, %s)', (from, to) => {
    expect(() => parseRange(from, to)).toThrow('from and to must be dates');
  });

  it('refuses a range that runs backwards', () => {
    expect(() => parseRange('2026-09-20', '2026-09-14')).toThrow('to cannot fall before from');
  });

  it('refuses a range wider than a quarter — a schedule asks for a week or a month', () => {
    expect(() => parseRange('2026-01-01', '2026-12-31')).toThrow('at most 92 days');
  });

  it('allows exactly the widest range', () => {
    expect(() => parseRange('2026-01-01', '2026-04-03')).not.toThrow();
  });
});
