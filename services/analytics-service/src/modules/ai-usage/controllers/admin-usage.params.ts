import { BadRequestException } from '@nestjs/common';
import { parseDayRange } from '../../../common/day-range.js';
import {
  ADMIN_USAGE_GROUPINGS,
  ADMIN_USAGE_PAYER_LIMIT,
  ADMIN_USAGE_PAYER_TYPES,
} from '../domain/admin-usage.js';
import type { AdminUsageGrouping, AdminUsagePayerType } from '../domain/admin-usage.js';

export const ADMIN_USAGE_DEFAULT_DAYS = 30;

export interface AdminUsageParams {
  from: string;
  to: string;
  groupBy: AdminUsageGrouping;
  payerType: AdminUsagePayerType | null;
  limit: number;
}

export interface RawAdminUsageParams {
  from?: string;
  to?: string;
  groupBy?: string;
  payerType?: string;
  limit?: string;
}

/**
 * Query of `GET admin/ai/usage`. Days default to the last 30 ending today (UTC), as
 * organization's `admin/stats`; a given end must be a calendar day, the range at most 366 days.
 */
export function parseAdminUsageParams(raw: RawAdminUsageParams, now: Date = new Date()): AdminUsageParams {
  let from = raw.from || undefined;
  let to = raw.to || undefined;
  if (!from && !to) {
    to = now.toISOString().slice(0, 10);
    from = shiftDay(to, -(ADMIN_USAGE_DEFAULT_DAYS - 1));
  } else if (!from || !to) {
    throw new BadRequestException('"from" and "to" go together, or both are left out');
  }
  parseDayRange(from, to);

  const groupBy = (raw.groupBy || 'capability') as AdminUsageGrouping;
  if (!ADMIN_USAGE_GROUPINGS.includes(groupBy)) {
    throw new BadRequestException(`"groupBy" must be one of ${ADMIN_USAGE_GROUPINGS.join(', ')}`);
  }

  let payerType: AdminUsagePayerType | null = null;
  if (raw.payerType) {
    if (!(ADMIN_USAGE_PAYER_TYPES as readonly string[]).includes(raw.payerType)) {
      throw new BadRequestException(`"payerType" must be one of ${ADMIN_USAGE_PAYER_TYPES.join(', ')}`);
    }
    payerType = raw.payerType as AdminUsagePayerType;
  }

  let limit: number = ADMIN_USAGE_PAYER_LIMIT.default;
  if (raw.limit !== undefined && raw.limit !== '') {
    limit = Number(raw.limit);
    if (!Number.isInteger(limit) || limit < ADMIN_USAGE_PAYER_LIMIT.min || limit > ADMIN_USAGE_PAYER_LIMIT.max) {
      throw new BadRequestException(
        `"limit" must be a whole number ${ADMIN_USAGE_PAYER_LIMIT.min}–${ADMIN_USAGE_PAYER_LIMIT.max}`,
      );
    }
  }

  return { from, to, groupBy, payerType, limit };
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
