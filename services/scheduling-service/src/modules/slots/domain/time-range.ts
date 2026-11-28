/**
 * The time a weekly slot or a single session takes within its day.
 *
 * One rule for both: a slot is the pattern sessions are laid from, so a range a
 * session may not have is one a slot may not have either. Times are `HH:MM` on
 * the school's wall clock; a range never crosses midnight.
 */

/** The longest lesson the timetable takes: anything longer is a typo, not a lesson. */
export const MAX_LESSON_MINUTES = 4 * 60;

export type TimeRangeError = 'END_TIME_NOT_AFTER_START' | 'LESSON_TOO_LONG';

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** `null` when the range is a lesson the timetable can hold. */
export function checkTimeRange(startTime: string, endTime: string): TimeRangeError | null {
  const length = toMinutes(endTime) - toMinutes(startTime);
  if (length <= 0) return 'END_TIME_NOT_AFTER_START';
  if (length > MAX_LESSON_MINUTES) return 'LESSON_TOO_LONG';
  return null;
}

export const TIME_RANGE_MESSAGES: Record<TimeRangeError, string> = {
  END_TIME_NOT_AFTER_START: 'A lesson ends after it starts, within the same day',
  LESSON_TOO_LONG: `A lesson lasts at most ${MAX_LESSON_MINUTES / 60} hours`,
};
