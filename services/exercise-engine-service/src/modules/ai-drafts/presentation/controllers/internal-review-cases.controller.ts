import {
  Controller,
  Get,
  ParseIntPipe,
  Query,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ListReviewCasesQuery } from '../../application/queries/list-review-cases/list-review-cases.query.js';
import type {
  ListReviewCasesError,
  ReviewCasesResult,
} from '../../application/queries/list-review-cases/list-review-cases.handler.js';
import { AI_DRAFT_CAPABILITIES, type AiDraftCapability } from '../../domain/entities/attempt-ai-draft.entity.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Teachers' settled drafts as labelled data, for ai-service to measure a candidate model on
 * (plan 79, step 1.6). Carries answer keys, so it is service-to-service only:
 * `x-internal-token`, not routed by the gateway. Callers must include the `/api/v1` prefix.
 *
 * 503 when content-service is unreachable — a set with holes would score a model on less
 * than it claims.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/ai-review-cases')
export class InternalReviewCasesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async list(
    @Query('capability') capability?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ReviewCasesResult> {
    if (!capability || !(AI_DRAFT_CAPABILITIES as readonly string[]).includes(capability)) {
      throw new UnprocessableEntityException(`capability must be one of: ${AI_DRAFT_CAPABILITIES.join(', ')}`);
    }
    if (limit !== undefined && (limit < 1 || limit > MAX_LIMIT)) {
      throw new UnprocessableEntityException(`limit must be between 1 and ${MAX_LIMIT}`);
    }

    const result: Result<ReviewCasesResult, ListReviewCasesError> = await this.queryBus.execute(
      new ListReviewCasesQuery(capability as AiDraftCapability, limit ?? DEFAULT_LIMIT),
    );
    if (result.isFail) throw new ServiceUnavailableException('An exercise could not be read from content-service');
    return result.value;
  }
}
