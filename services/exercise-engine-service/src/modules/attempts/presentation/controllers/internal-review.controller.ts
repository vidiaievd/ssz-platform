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
import { ReviewAttemptCommand } from '../../application/commands/review-attempt/review-attempt.command.js';
import type {
  ReviewAttemptError,
  ReviewAttemptResult,
} from '../../application/commands/review-attempt/review-attempt.handler.js';
import { ReviewAttemptRequestDto } from '../dto/review-attempt.dto.js';
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
import { AggregateReviewLoadRequestDto } from '../dto/review-oversight.dto.js';
import { ListPendingReviewSchoolsQuery } from '../../application/queries/list-pending-review-schools/list-pending-review-schools.query.js';
import type { ListPendingReviewSchoolsResult } from '../../application/queries/list-pending-review-schools/list-pending-review-schools.handler.js';
import { AggregateReviewLoadQuery } from '../../application/queries/aggregate-review-load/aggregate-review-load.query.js';
import type { AggregateReviewLoadResult } from '../../application/queries/aggregate-review-load/aggregate-review-load.handler.js';
import { ListReviewDecisionsQuery } from '../../application/queries/list-review-decisions/list-review-decisions.query.js';
import type { ListReviewDecisionsResult } from '../../application/queries/list-review-decisions/list-review-decisions.handler.js';
import { decodeReviewDecisionsCursor } from '../../application/queries/list-review-decisions/review-decisions-cursor.js';
import {
  ListMySubmissionsQuery,
  type MySubmissionsStatus,
} from '../../application/queries/list-my-submissions/list-my-submissions.query.js';
import type { ListMySubmissionsResult } from '../../application/queries/list-my-submissions/list-my-submissions.handler.js';
import { decodeMySubmissionsCursor } from '../../application/queries/list-my-submissions/my-submissions-cursor.js';
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

/** How far back oversight may count verdicts when the caller does not say. */
const DEFAULT_PERIOD_DAYS = 30;

/** The journal's page; a hundred is the ceiling, as everywhere else on this controller. */
const DEFAULT_DECISIONS_LIMIT = 50;

/** A learner's own list; a hundred is the ceiling, as everywhere else on this controller. */
const DEFAULT_MY_SUBMISSIONS_LIMIT = 50;

const MY_SUBMISSIONS_STATUSES: readonly MySubmissionsStatus[] = [
  'all',
  'pending',
  'returned',
  'approved',
];

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

  /**
   * The teacher's inbox: everything waiting across a school, narrowed to what the caller
   * teaches or owns, grouped for the screen and paged by cursor.
   *
   * Superseded `review/search`, which took the caller's own list of exercise ids — a
   * whole course walked before the first row could be drawn, and no way at all to ask
   * "everything my students handed in". That route and the per-exercise `GET review` went
   * with the course inbox in step 45.10.
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
   * The shape of a school's review load — the administrator's screen, in one call.
   *
   * Times only, never judgements about them: no median, no "overdue", no names. The
   * promised response time is the school's policy and lives elsewhere (44.12), so the
   * figures that depend on it are computed where that policy is known (§0.1).
   *
   * A POST for a read, like the queue: the answer is a school-wide picture, and the body
   * is what says which school and how far back.
   */
  /**
   * Which schools have anything waiting at all — the digest job's first call (plan 47.5).
   *
   * Deliberately platform-wide and deliberately thin: three numbers per school, no names,
   * no submissions. The job that runs on a timer needs to know where to look before it
   * asks anyone for detail, and a route that made it walk every school to find that out
   * would spend most of its night on quiet ones.
   *
   * Declared before the parameterised routes so the literal segment keeps winning.
   */
  @Get('review/schools')
  async listPendingReviewSchools(): Promise<ListPendingReviewSchoolsResult> {
    return this.queryBus.execute<ListPendingReviewSchoolsQuery, ListPendingReviewSchoolsResult>(
      new ListPendingReviewSchoolsQuery(),
    );
  }

  @Post('review/aggregate')
  @HttpCode(HttpStatus.OK)
  async aggregateReviewLoad(
    @Body() dto: AggregateReviewLoadRequestDto,
  ): Promise<AggregateReviewLoadResult> {
    if (!dto.schoolId) {
      throw new UnprocessableEntityException('schoolId is required');
    }

    return this.queryBus.execute<AggregateReviewLoadQuery, AggregateReviewLoadResult>(
      new AggregateReviewLoadQuery(dto.schoolId, dto.periodDays ?? DEFAULT_PERIOD_DAYS),
    );
  }

  /**
   * Who decided what, newest first — the journal the CSV export is later built from
   * (46.5), not built here.
   *
   * Declared before `:attemptId/review` so the literal segment keeps winning: Nest
   * matches in declaration order.
   */
  @Get('review/decisions')
  async listReviewDecisions(
    @Query('schoolId') schoolId?: string,
    @Query('periodDays', new DefaultValuePipe(DEFAULT_PERIOD_DAYS), ParseIntPipe)
    periodDays = DEFAULT_PERIOD_DAYS,
    @Query('limit', new DefaultValuePipe(DEFAULT_DECISIONS_LIMIT), ParseIntPipe)
    limit = DEFAULT_DECISIONS_LIMIT,
    @Query('cursor') cursor?: string,
  ): Promise<ListReviewDecisionsResult> {
    if (!schoolId) {
      throw new UnprocessableEntityException('schoolId is required');
    }

    const after = cursor ? decodeReviewDecisionsCursor(cursor) : null;
    if (cursor && after === null) {
      throw new UnprocessableEntityException('Malformed cursor');
    }

    return this.queryBus.execute<ListReviewDecisionsQuery, ListReviewDecisionsResult>(
      new ListReviewDecisionsQuery(
        schoolId,
        Math.min(Math.max(periodDays, 1), 365),
        Math.min(Math.max(limit, 1), 100),
        after,
      ),
    );
  }

  /**
   * A learner's own submissions — screen E of the handoff (plan 47.1). No `schoolId`: this
   * is the learner's own history across every school and course they have ever submitted
   * to, and unlike the teacher-facing routes above there is no scope here to narrow by.
   *
   * `reviewDecisions`, `validationDetails`, and `submittedAnswer` never leave
   * `ListMySubmissionsHandler`: it maps each attempt onto `MySubmissionEntry` field by
   * field rather than forwarding the row, so the field a learner must never see (the
   * answer key, an unreleased per-sentence note) has nowhere to ride along on even
   * though Prisma still reads it off the row internally. A snapshot test on this
   * route's fields is the guard.
   */
  @Get('review/mine')
  async listMySubmissions(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(DEFAULT_MY_SUBMISSIONS_LIMIT), ParseIntPipe)
    limit = DEFAULT_MY_SUBMISSIONS_LIMIT,
    @Query('cursor') cursor?: string,
  ): Promise<ListMySubmissionsResult> {
    if (!userId) {
      throw new UnprocessableEntityException('userId is required');
    }
    const safeStatus = status ?? 'all';
    if (!MY_SUBMISSIONS_STATUSES.includes(safeStatus as MySubmissionsStatus)) {
      throw new UnprocessableEntityException('Invalid status');
    }

    const after = cursor ? decodeMySubmissionsCursor(cursor) : null;
    if (cursor && after === null) {
      throw new UnprocessableEntityException('Malformed cursor');
    }

    return this.queryBus.execute<ListMySubmissionsQuery, ListMySubmissionsResult>(
      new ListMySubmissionsQuery(
        userId,
        safeStatus as MySubmissionsStatus,
        Math.min(Math.max(limit, 1), 100),
        after,
      ),
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
        dto.rubricMarks ?? null,
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
          // Which criteria are still blank, so the screen can point at them rather than
          // say the verdict failed for reasons of its own.
          case 'RUBRIC_INCOMPLETE':
            throw new UnprocessableEntityException({
              code: 'RUBRIC_INCOMPLETE',
              missing: error.missing,
            });
        }
      }
      // A submission that was never routed to a person at all, or an exercise this
      // service could not fetch to recompute the parse against.
      throw new UnprocessableEntityException('Cannot review this attempt');
    }

    return result.value;
  }
}
