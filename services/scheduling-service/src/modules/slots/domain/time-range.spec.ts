import { checkTimeRange, MAX_LESSON_MINUTES } from './time-range.js';

describe('checkTimeRange', () => {
  it('takes an ordinary lesson', () => {
    expect(checkTimeRange('18:00', '19:30')).toBeNull();
  });

  it('takes a lesson of exactly the longest length', () => {
    expect(MAX_LESSON_MINUTES).toBe(240);
    expect(checkTimeRange('09:00', '13:00')).toBeNull();
  });

  it('refuses a range that ends when it starts or before', () => {
    expect(checkTimeRange('10:00', '10:00')).toBe('END_TIME_NOT_AFTER_START');
    expect(checkTimeRange('19:00', '18:00')).toBe('END_TIME_NOT_AFTER_START');
  });

  it('refuses a range a minute past the longest length', () => {
    expect(checkTimeRange('09:00', '13:01')).toBe('LESSON_TOO_LONG');
  });

  // The slot that started this: NO-A2-2026 had "00:00–13:45" twice a week.
  it('refuses a near-whole-day slot', () => {
    expect(checkTimeRange('00:00', '13:45')).toBe('LESSON_TOO_LONG');
  });
});
