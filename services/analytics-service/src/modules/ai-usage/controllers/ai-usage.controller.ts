import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../common/guards/internal-auth.guard.js';
import { parseDayRange } from '../../../common/day-range.js';
import { AI_USAGE_DIMENSIONS } from '../domain/usage-aggregate.js';
import type { AiUsageDimension } from '../domain/usage-aggregate.js';
import { GetAiUsageQuery } from '../queries/get-ai-usage.query.js';
import type { GetAiUsageResult } from '../queries/get-ai-usage.handler.js';
import { GetAiDraftQualityQuery } from '../queries/get-ai-draft-quality.query.js';
import type { GetAiDraftQualityResult } from '../queries/get-ai-draft-quality.handler.js';

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
    parseDayRange(from, to);
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
    parseDayRange(from, to);
    return this.queryBus.execute(new GetAiDraftQualityQuery(from!, to!));
  }
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
