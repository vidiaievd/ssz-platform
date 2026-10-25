import { BadRequestException } from '@nestjs/common';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

/** `from`/`to` query days, `YYYY-MM-DD` UTC, inclusive: both valid, in order, no more than a year apart. */
export function parseDayRange(from: string | undefined, to: string | undefined): void {
  const fromDay = parseDay('from', from);
  const toDay = parseDay('to', to);
  const span = (toDay.getTime() - fromDay.getTime()) / 86_400_000;
  if (span < 0) throw new BadRequestException('"from" is after "to"');
  if (span >= MAX_RANGE_DAYS) {
    throw new BadRequestException(`Range is longer than ${MAX_RANGE_DAYS} days`);
  }
}

function parseDay(name: string, value: string | undefined): Date {
  if (!value || !DAY_PATTERN.test(value)) {
    throw new BadRequestException(`"${name}" must be a day, YYYY-MM-DD`);
  }
  const day = new Date(`${value}T00:00:00Z`);
  // Rejects 2026-02-30 and the like, which Date would quietly roll into March.
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`"${name}" is not a calendar day`);
  }
  return day;
}
