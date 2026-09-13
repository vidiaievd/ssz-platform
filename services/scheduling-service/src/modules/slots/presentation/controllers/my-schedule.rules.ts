import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';

/** How far a single request may look. A schedule asks for a week or a month, not a year. */
export const MAX_RANGE_DAYS = 92;

/**
 * Whose schedule is being asked for.
 *
 * Your own, and nobody else's. A school's view of who teaches what is the timetable and
 * the workload screens, which answer about the school rather than about one person — and
 * they check membership of that school before they do.
 *
 * `me` resolves to the caller so a screen need not know its own user id.
 */
export function resolveScheduleTarget(teacherId: string, user: AuthenticatedUser): string {
  const target = teacherId === 'me' ? user.userId : teacherId;
  if (target !== user.userId && !user.isPlatformAdmin) {
    throw new ForbiddenException('You can only read your own schedule');
  }
  return target;
}

/** The window, as two UTC midnights — the column is a date, and so is the question. */
export function parseRange(from: string, to: string): { from: Date; to: Date } {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  if (!from || !to || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('from and to must be dates, as YYYY-MM-DD');
  }
  if (end < start) {
    throw new BadRequestException('to cannot fall before from');
  }
  if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    throw new BadRequestException(`A range may span at most ${MAX_RANGE_DAYS} days`);
  }

  return { from: start, to: end };
}
