import {
  Body,
  ConflictException,
  Controller,
  DefaultValuePipe,
  Delete,
  HttpCode,
  HttpStatus,
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
import { GetSubmissionForReviewQuery } from '../../application/queries/get-submission-for-review/get-submission-for-review.query.js';
import { ClaimReviewCommand } from '../../application/commands/claim-review/claim-review.command.js';
import type { ClaimReviewError } from '../../application/commands/claim-review/claim-review.handler.js';
import { ReleaseReviewCommand } from '../../application/commands/release-review/release-review.command.js';
import type { ReleaseReviewError } from '../../application/commands/release-review/release-review.handler.js';
import type { ReviewLockResult } from '../../application/commands/review-lock.result.js';
import { ReviewLockRequestDto } from '../dto/review-lock.dto.js';
import { BatchApproveRequestDto } from '../dto/batch-approve.dto.js';
import { BatchApproveCommand } from '../../application/commands/batch-approve/batch-approve.command.js';
import type { BatchApproveResult } from '../../application/commands/batch-approve/batch-approve.handler.js';
import type {
  GetSubmissionForReviewError,
  GetSubmissionForReviewResult,
} from '../../application/queries/get-submission-for-review/get-submission-for-review.handler.js';
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
 * How many submissions one batch approval may carry (plan 44 §44.10).
 *
 * Not a page size but a sanity bound on an irreversible action: the modal names every
 * learner in it, and a caller sending more than this has stopped enumerating and started
 * filtering.
 */
const MAX_BATCH_APPROVE = 100;

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

  /**
   * Approve a list of submissions the machine had already closed, in one call.
   *
   * Declared before the parameterised routes so the literal `review/batch-approve` keeps
   * winning: Nest matches in declaration order.
   *
   * Partial success is a 200, not an error — `skipped` names what was left alone and
   * why, and the screen shows it as a toast beside the count. The one refusal is a list
   * longer than the ceiling: a modal that listed a hundred learners by name has stopped
   * being a list a teacher read.
   */
  @Post('review/batch-approve')
  @HttpCode(HttpStatus.OK)
  async batchApprove(@Body() dto: BatchApproveRequestDto): Promise<BatchApproveResult> {
    if (!dto.schoolId) {
      throw new UnprocessableEntityException('schoolId is required');
    }
    if (!dto.reviewerId) {
      throw new UnprocessableEntityException('reviewerId is required');
    }

    const attemptIds = [...new Set(dto.attemptIds)];
    if (attemptIds.length > MAX_BATCH_APPROVE) {
      throw new UnprocessableEntityException(
        `At most ${MAX_BATCH_APPROVE} submissions may be approved at once`,
      );
    }

    return this.commandBus.execute<BatchApproveCommand, BatchApproveResult>(
      new BatchApproveCommand(dto.schoolId, dto.reviewerId, attemptIds),
    );
  }

  /**
   * One submission, everything the reviewer's screen is drawn from.
   *
   * `schoolId` is required for the same reason the queue requires it (plan 44 §0.2): the
   * engine authorises nothing, so the caller states whose submission it believes it is
   * asking for, and a mismatch comes back as 404 rather than 403 — a caller with no
   * business here should not learn the attempt exists.
   *
   * The route is declared after `GET review` so the literal segment keeps winning; a
   * UUID pipe on the parameter would not save it, since Nest matches in declaration
   * order.
   */
  @Get(':attemptId/review')
  async getSubmission(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Query('schoolId') schoolId?: string,
  ): Promise<GetSubmissionForReviewResult> {
    if (!schoolId) {
      throw new UnprocessableEntityException('schoolId is required');
    }

    const result: Result<GetSubmissionForReviewResult, GetSubmissionForReviewError> =
      await this.queryBus.execute(new GetSubmissionForReviewQuery(attemptId, schoolId));

    if (result.isFail) {
      throw new NotFoundException('Attempt not found');
    }

    return result.value;
  }

  /**
   * "I am looking at this one" — and, fifteen minutes later, not any more.
   *
   * 200 rather than 201: the answer is who holds the submission now, which may well be a
   * colleague whose live marker this call did not displace. Nothing was created then, and
   * the reviewer is not being turned away either — the marker is advisory, so reading and
   * deciding stay open to them and the screen simply names who else is in here.
   */
  @Post(':attemptId/review/lock')
  @HttpCode(HttpStatus.OK)
  async claimReview(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: ReviewLockRequestDto,
  ): Promise<ReviewLockResult> {
    const { schoolId, teacherId } = this.lockActor(dto);

    const result: Result<ReviewLockResult, ClaimReviewError> = await this.commandBus.execute(
      new ClaimReviewCommand(attemptId, schoolId, teacherId),
    );

    if (result.isFail) {
      if (result.error.code === 'ATTEMPT_NOT_FOUND') {
        throw new NotFoundException('Attempt not found');
      }
      // Decided already, or never routed to a person: a marker placed now would never be
      // cleared, since clearing is what a verdict does.
      throw new UnprocessableEntityException('This submission is not waiting for review');
    }

    return result.value;
  }

  /** The reviewer left the screen. Idempotent, and it never lifts a colleague's marker. */
  @Delete(':attemptId/review/lock')
  @HttpCode(HttpStatus.OK)
  async releaseReview(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: ReviewLockRequestDto,
  ): Promise<ReviewLockResult> {
    const { schoolId, teacherId } = this.lockActor(dto);

    const result: Result<ReviewLockResult, ReleaseReviewError> = await this.commandBus.execute(
      new ReleaseReviewCommand(attemptId, schoolId, teacherId),
    );

    if (result.isFail) {
      throw new NotFoundException('Attempt not found');
    }

    return result.value;
  }

  /** Both fields, both 422 — see `ReviewLockRequestDto` for why they are checked here. */
  private lockActor(dto: ReviewLockRequestDto): { schoolId: string; teacherId: string } {
    if (!dto.schoolId) {
      throw new UnprocessableEntityException('schoolId is required');
    }
    if (!dto.teacherId) {
      throw new UnprocessableEntityException('teacherId is required');
    }
    return { schoolId: dto.schoolId, teacherId: dto.teacherId };
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
        // Three verdicts on the screen, two in the engine — see the DTO.
        dto.outcome === 'returned' ? 'returned' : 'approved',
        dto.decisions ?? [],
        dto.comment ?? null,
        dto.sentenceComments ?? {},
      ),
    );

    if (result.isFail) {
      const error = result.error;
      if ('code' in error) {
        switch (error.code) {
          case 'ATTEMPT_NOT_FOUND':
            throw new NotFoundException('Attempt not found');
          // The screen goes read-only and names the colleague, so it is told which one
          // and what they decided — not merely that it was too late (criterion 24).
          case 'ALREADY_REVIEWED':
            throw new ConflictException({
              code: 'ALREADY_REVIEWED',
              by: error.by,
              verdict: error.verdict,
              at: error.at.toISOString(),
            });
          // Inline on the comment field, which is why it travels as a code and not as
          // prose (criterion 18).
          case 'RETURN_REQUIRES_COMMENT':
            throw new UnprocessableEntityException({ code: 'RETURN_REQUIRES_COMMENT' });
        }
      }
      // A submission that was never routed to a person at all, or an exercise this
      // service could not fetch to recompute the parse against.
      throw new UnprocessableEntityException('Cannot review this attempt');
    }

    return result.value;
  }
}
