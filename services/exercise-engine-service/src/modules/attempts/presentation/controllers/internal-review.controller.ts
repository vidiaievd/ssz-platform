import {
  Body,
  Controller,
  DefaultValuePipe,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Get,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { ListReviewQueueQuery } from '../../application/queries/list-review-queue/list-review-queue.query.js';
import type { ListReviewQueueResult } from '../../application/queries/list-review-queue/list-review-queue.handler.js';
import { ReviewAttemptCommand } from '../../application/commands/review-attempt/review-attempt.command.js';
import type {
  ReviewAttemptError,
  ReviewAttemptResult,
} from '../../application/commands/review-attempt/review-attempt.handler.js';
import { ReviewAttemptRequestDto } from '../dto/review-attempt.dto.js';
import type { Result } from '../../../../shared/kernel/result.js';

/**
 * The teacher's side of an attempt — service-to-service only.
 *
 * It is internal because this service cannot answer the question these routes turn on:
 * *may this person mark this submission?* An attempt here carries a user and an exercise,
 * no school and no course, so the caller does the authorising — the web BFF asks
 * content-service whether the teacher may edit the exercise, and only then opens its
 * queue. Exposing the same routes on the public gateway with a learner's own JWT would
 * hand every learner their classmates' submissions.
 *
 * `@Public` exempts them from the global JwtAuthGuard; `InternalAuthGuard` takes over.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/attempts')
export class InternalReviewController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  /** Everything waiting on a person for one exercise, oldest submission first. */
  @Get('review')
  async listReviewQueue(
    @Query('exerciseId') exerciseId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<ListReviewQueueResult> {
    return this.queryBus.execute<ListReviewQueueQuery, ListReviewQueueResult>(
      new ListReviewQueueQuery(exerciseId, Math.min(limit, 100), offset),
    );
  }

  @Post(':attemptId/review')
  async review(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: ReviewAttemptRequestDto,
  ): Promise<ReviewAttemptResult> {
    const result: Result<ReviewAttemptResult, ReviewAttemptError> = await this.commandBus.execute(
      new ReviewAttemptCommand(
        attemptId,
        dto.reviewerId,
        dto.outcome,
        dto.decisions ?? [],
        dto.comment ?? null,
      ),
    );

    if (result.isFail) {
      const error = result.error;
      if ('code' in error && error.code === 'ATTEMPT_NOT_FOUND') {
        throw new NotFoundException('Attempt not found');
      }
      // Everything else is a submission that is no longer waiting: reviewed by a
      // colleague a minute ago, or never routed for review at all.
      throw new UnprocessableEntityException('Cannot review this attempt');
    }

    return result.value;
  }
}
