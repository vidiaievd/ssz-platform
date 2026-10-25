export type ReviewBlockRepeat = 'one_off' | 'weekly';

/** One dated sitting of a block — what a calendar draws and what load counts. */
export interface ReviewBlockOccurrence {
  blockId: string;
  schoolId: string;
  teacherId: string;
  repeat: ReviewBlockRepeat;
  date: Date;
  startTime: string;
  endTime: string;
  note: string | null;
}

export type ReviewBlockShapeError =
  | 'INVALID_TIME'
  | 'END_TIME_NOT_AFTER_START'
  | 'ENDS_BEFORE_START'
  | 'ONE_OFF_SPANS_DAYS';

export interface ReviewBlockShape {
  repeat: ReviewBlockRepeat;
  startsOn: Date;
  endsOn: Date | null;
  startTime: string;
  endTime: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Midnight UTC of the calendar day. Block dates are `@db.Date` columns, read back
 * as UTC midnight — local midnight would shift a day for any process west of UTC.
 */
export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * The rules every block obeys, whoever writes it. A block sits within one day —
 * marking past midnight is two blocks — and a one-off is a series of one day, so
 * its last day is its first.
 */
export function checkReviewBlockShape(shape: ReviewBlockShape): ReviewBlockShapeError | null {
  if (!HHMM.test(shape.startTime) || !HHMM.test(shape.endTime)) return 'INVALID_TIME';
  if (minutes(shape.endTime) <= minutes(shape.startTime)) return 'END_TIME_NOT_AFTER_START';

  const starts = utcDay(shape.startsOn).getTime();
  if (shape.repeat === 'one_off') {
    if (shape.endsOn === null || utcDay(shape.endsOn).getTime() !== starts) return 'ONE_OFF_SPANS_DAYS';
    return null;
  }
  if (shape.endsOn !== null && utcDay(shape.endsOn).getTime() < starts) return 'ENDS_BEFORE_START';
  return null;
}

export class ReviewBlock {
  constructor(
    public readonly id: string,
    public readonly schoolId: string,
    public readonly teacherId: string,
    public readonly repeat: ReviewBlockRepeat,
    public readonly startsOn: Date,
    /** Inclusive. Equals startsOn for a one-off; null is a series with no end. */
    public readonly endsOn: Date | null,
    public readonly startTime: string,
    public readonly endTime: string,
    public readonly note: string | null,
    public readonly createdBy: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    /** Days taken out of the series, as `YYYY-MM-DD`. */
    public readonly skips: ReadonlySet<string> = new Set(),
  ) {}

  get durationMinutes(): number {
    return minutes(this.endTime) - minutes(this.startTime);
  }

  /**
   * The sittings that fall on days `from`..`to`, both inclusive, skipped days left
   * out. The rule is expanded here rather than stored as rows: a block has no log
   * and no attendance, so a row per week would hold nothing but its date.
   */
  occurrencesBetween(from: Date, to: Date): ReviewBlockOccurrence[] {
    const first = Math.max(utcDay(from).getTime(), utcDay(this.startsOn).getTime());
    const last = Math.min(
      utcDay(to).getTime(),
      this.endsOn === null ? Number.POSITIVE_INFINITY : utcDay(this.endsOn).getTime(),
    );
    if (first > last) return [];

    const step = this.repeat === 'weekly' ? 7 * DAY_MS : Number.POSITIVE_INFINITY;
    // Days since the series began, rounded up to the next whole step, so the first
    // sitting in the window lands on the series' own weekday.
    const startsAt = utcDay(this.startsOn).getTime();
    const offset = first - startsAt;
    let at = this.repeat === 'weekly' ? startsAt + Math.ceil(offset / step) * step : startsAt;

    const out: ReviewBlockOccurrence[] = [];
    for (; at <= last; at += step) {
      const date = new Date(at);
      if (this.skips.has(dayKey(date))) continue;
      out.push({
        blockId: this.id,
        schoolId: this.schoolId,
        teacherId: this.teacherId,
        repeat: this.repeat,
        date,
        startTime: this.startTime,
        endTime: this.endTime,
        note: this.note,
      });
    }
    return out;
  }
}
