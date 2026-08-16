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
import { ReviewQueueRequestDto, ReviewQueueScopeDto } from '../dto/review-queue.dto.js';
import { ListReviewQueueV2Query } from '../../application/queries/list-review-queue-v2/list-review-queue-v2.query.js';
import type { ListReviewQueueV2Result } from '../../application/queries/list-review-queue-v2/list-review-queue-v2.handler.js';
import { decodeReviewQueueCursor } from '../../application/queries/list-review-queue-v2/review-queue-cursor.js';
import { CountReviewQueueQuery } from '../../application/queries/count-review-queue/count-review-queue.query.js';
import type {
  ReviewQueueScope,
  ReviewQueueSummary,
} from '../../domain/repositories/attempt.repository.js';
import type { Result } from '../../../../shared/kernel/result.js';

/**
 * A ceiling on the course, not on the page: the set is what the queue is *filtered* by,
 * and a caller asking about ten thousand exercises has lost track of what it is asking.
 */
const MAX_EXERCISES_PER_QUEUE = 500;

/** The default page of the scoped queue; a hundred is the ceiling (see the DTO). */
const DEFAULT_QUEUE_LIMIT = 50;

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

  /**
   * The teacher's inbox: everything waiting across a school, narrowed to what the caller
   * teaches or owns, grouped for the screen and paged by cursor.
   *
   * Supersedes `review/search`, which took the caller's own list of exercise ids — a
   * whole course walked before the first row could be drawn, and no way at all to ask
   * "everything my students handed in". The two live side by side until step 45.10 moves
   * the web inbox over.
   */
  @Post('review/queue')
  async reviewQueue(@Body() dto: ReviewQueueRequestDto): Promise<ListReviewQueueV2Result> {
    const scope = this.scopeOf(dto);

    const after = dto.cursor ? decodeReviewQueueCursor(dto.cursor) : null;
    if (dto.cursor && after === null) {
      throw new UnprocessableEntityException('Malformed cursor');
    }

    return this.queryBus.execute<ListReviewQueueV2Query, ListReviewQueueV2Result>(
      new ListReviewQueueV2Query(
        scope,
        dto.groupBy ?? 'exercise',
        dto.limit ?? DEFAULT_QUEUE_LIMIT,
        after,
      ),
    );
  }

  /** The same scope, counted — for a badge that is refreshed on every verdict. */
  @Post('review/queue/count')
  async reviewQueueCount(@Body() dto: ReviewQueueScopeDto): Promise<ReviewQueueSummary> {
    return this.queryBus.execute<CountReviewQueueQuery, ReviewQueueSummary>(
      new CountReviewQueueQuery(this.scopeOf(dto)),
    );
  }

  /**
   * School plus at least one narrowing dimension — both 422, both from here.
   *
   * A school alone would be every submission in it: the oversight question, which has
   * its own route (44.11) and its own authorisation. A reviewer asks about their groups
   * or their courses, and having to say which is what keeps a teacher's inbox from
   * quietly becoming an administrator's.
   */
  private scopeOf(dto: ReviewQueueScopeDto): ReviewQueueScope {
    if (!dto.schoolId) {
      throw new UnprocessableEntityException('schoolId is required');
    }

    const groupIds = dto.groupIds?.length ? [...new Set(dto.groupIds)] : undefined;
    const containerIds = dto.containerIds?.length ? [...new Set(dto.containerIds)] : undefined;

    if (!groupIds && !containerIds) {
      throw new UnprocessableEntityException('Either groupIds or containerIds must be given');
    }

    return {
      schoolId: dto.schoolId,
      groupIds,
      containerIds,
      templateCodes: dto.templateCodes?.length ? [...new Set(dto.templateCodes)] : undefined,
    };
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
