import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../common/guards/internal-auth.guard.js';
import { AI_USAGE_DIMENSIONS } from '../domain/usage-aggregate.js';
import type { AiUsageDimension } from '../domain/usage-aggregate.js';
import { GetAiUsageQuery } from '../queries/get-ai-usage.query.js';
import type { GetAiUsageResult } from '../queries/get-ai-usage.handler.js';
import { GetAiDraftQualityQuery } from '../queries/get-ai-draft-quality.query.js';
import type { GetAiDraftQualityResult } from '../queries/get-ai-draft-quality.handler.js';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

/**
 * AI usage rollup for the future platform admin — plan 77, step 10.
 *
 * Internal: it answers about every school's and user's spending at once, and no admin
 * surface exists yet to put a role check in front of it. `@Public()` takes it from the JWT
 * guard, `InternalAuthGuard` takes over, as with `internal/mastery`.
 *
 * `GET /internal/ai-usage?from=2026-10-01&to=2026-10-21&groupBy=day,capability,model`
 * — days inclusive, UTC; `groupBy` any of day, capability, provider, model, payer, outcome;
 * omitted, the whole range comes back as one total.
 */
@ApiExcludeController()
@Controller('internal/ai-usage')
@Public()
@UseGuards(InternalAuthGuard)
export class AiUsageController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async usage(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
  ): Promise<GetAiUsageResult> {
    parseRange(from, to);
    return this.queryBus.execute(new GetAiUsageQuery(from!, to!, parseGroupBy(groupBy)));
  }

  /**
   * What teachers did with review drafts, per agent × model × prompt version over the range
   * (plan 79, 1.5): `GET /internal/ai-usage/review-drafts?from=2026-10-01&to=2026-10-22`.
   * `review_direct` groups carry the reviews models delivered to learners and how many of
   * them learners disputed (2.3b).
   */
  @Get('review-drafts')
  async reviewDrafts(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<GetAiDraftQualityResult> {
    parseRange(from, to);
    return this.queryBus.execute(new GetAiDraftQualityQuery(from!, to!));
  }
}

/** Both days valid, in order, and no more than a year apart. */
function parseRange(from: string | undefined, to: string | undefined): void {
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

function parseGroupBy(value: string | undefined): AiUsageDimension[] {
  if (!value) return [];
  const dims = [...new Set(value.split(',').map((d) => d.trim()).filter(Boolean))];
  const unknown = dims.filter((d) => !(AI_USAGE_DIMENSIONS as readonly string[]).includes(d));
  if (unknown.length > 0) {
    throw new BadRequestException(
      `Unknown groupBy: ${unknown.join(', ')} (allowed: ${AI_USAGE_DIMENSIONS.join(', ')})`,
    );
  }
  return dims as AiUsageDimension[];
}
