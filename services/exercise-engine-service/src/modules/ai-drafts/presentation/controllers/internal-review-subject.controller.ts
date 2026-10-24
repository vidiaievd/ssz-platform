import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import { GetReviewSubjectQuery } from '../../application/queries/get-review-subject/get-review-subject.query.js';
import type {
  GetReviewSubjectError,
  ReviewSubjectResult,
} from '../../application/queries/get-review-subject/get-review-subject.handler.js';
import { AI_DRAFT_CAPABILITIES, type AiDraftCapability } from '../../domain/entities/attempt-ai-draft.entity.js';

/**
 * What ai-service drafts a review from (plan 79, step 1.3). Carries the answer key, so it is
 * service-to-service only: `x-internal-token`, not routed by the gateway. Callers must
 * include the `/api/v1` prefix.
 *
 * 200 with `skip` set when there is nothing to draft — a decided submission, one with a
 * draft already, a template without a prompt. 503 when content-service is unreachable: the
 * one answer a caller should retry.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/attempts/:attemptId/ai-review-subject')
export class InternalReviewSubjectController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async get(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Query('capability') capability?: string,
  ): Promise<ReviewSubjectResult> {
    if (!capability || !(AI_DRAFT_CAPABILITIES as readonly string[]).includes(capability)) {
      throw new UnprocessableEntityException(`capability must be one of: ${AI_DRAFT_CAPABILITIES.join(', ')}`);
    }

    const result: Result<ReviewSubjectResult, GetReviewSubjectError> = await this.queryBus.execute(
      new GetReviewSubjectQuery(attemptId, capability as AiDraftCapability),
    );
    if (result.isFail) {
      if (result.error.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException(`Attempt ${attemptId} not found`);
      throw new ServiceUnavailableException('The exercise could not be read from content-service');
    }
    return result.value;
  }
}
