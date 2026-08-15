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
import { SearchReviewQueueRequestDto } from '../dto/search-review-queue.dto.js';
import type { Result } from '../../../../shared/kernel/result.js';

/**
 * A ceiling on the course, not on the page: the set is what the queue is *filtered* by,
 * and a caller asking about ten thousand exercises has lost track of what it is asking.
 */
const MAX_EXERCISES_PER_QUEUE = 500;

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
      new ListReviewQueueQuery([exerciseId], Math.min(limit, 100), offset),
    );
  }

  /**
   * The same queue over a set of exercises — a whole course, as the teacher's inbox asks
   * for it.
   *
   * A POST for a read, because the filter is the caller's list of exercises: a course of
   * two hundred exercises is seven thousand characters of UUID, which is a query string
   * only in theory. The caller has been authorised once, against the course those
   * exercises came out of.
   */
  @Post('review/search')
  async searchReviewQueue(@Body() dto: SearchReviewQueueRequestDto): Promise<ListReviewQueueResult> {
    const exerciseIds = [...new Set(dto.exerciseIds)];
    if (exerciseIds.length > MAX_EXERCISES_PER_QUEUE) {
      throw new UnprocessableEntityException(
        `At most ${MAX_EXERCISES_PER_QUEUE} exercises may be queried at once`,
      );
    }

    return this.queryBus.execute<ListReviewQueueQuery, ListReviewQueueResult>(
      new ListReviewQueueQuery(exerciseIds, Math.min(dto.limit ?? 20, 100), dto.offset ?? 0),
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
