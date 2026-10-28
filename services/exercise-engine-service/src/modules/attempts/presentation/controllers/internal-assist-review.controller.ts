import {
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { Result } from '../../../../shared/kernel/result.js';
import { GetAttemptByIdQuery } from '../../application/queries/get-attempt-by-id/get-attempt-by-id.query.js';
import type { GetAttemptByIdError } from '../../application/queries/get-attempt-by-id/get-attempt-by-id.handler.js';
import type { RubricMarks } from '@ssz/shared-kernel/writing-task';
import type { Attempt, AttemptStatus } from '../../domain/entities/attempt.entity.js';

/** A learner's reviewed work as the student assistant reads it (plan 83, step 2). */
export interface AssistReviewedWork {
  attemptId: string;
  exerciseId: string;
  courseId: string | null;
  templateCode: string;
  status: AttemptStatus;
  reviewedBy: 'teacher' | 'ai';
  reviewedAt: string | null;
  score: number | null;
  passed: boolean | null;
  /** The learner's own answer — theirs to discuss once it is judged. */
  answer: unknown;
  comment: string | null;
  decisions: { itemId: string; approved: boolean; comment: string | null }[];
  rubricMarks: RubricMarks | null;
}

/**
 * Null until a verdict is delivered — a teacher's, or a model's for a learner nobody else
 * reviews. Before it the work is still the learner's to get right, and the assistant must
 * not discuss what is wrong with it (R-g); a school's provisional model verdict is not a
 * delivery either. `validationDetails` never leaves: validators keep the key there.
 */
export function toAssistReviewedWork(attempt: Attempt): AssistReviewedWork | null {
  const reviewedBy = attempt.reviewedBy;
  if (reviewedBy === null) return null;
  return {
    attemptId: attempt.id,
    exerciseId: attempt.exerciseId,
    courseId: attempt.containerId,
    templateCode: attempt.templateCode,
    status: attempt.status,
    reviewedBy,
    reviewedAt: attempt.reviewedAt?.toISOString() ?? null,
    score: attempt.scoreValue,
    passed: attempt.passed,
    answer: attempt.submittedAnswer ?? null,
    comment: attempt.reviewComment,
    decisions: (attempt.reviewDecisions ?? []).map((d) => ({ itemId: d.itemId, approved: d.approved, comment: d.comment ?? null })),
    rubricMarks: attempt.rubricMarks,
  };
}

/**
 * ai-service's student assistant reads the learner's own reviewed attempt here (plan 83,
 * step 2). The caller names the learner from their token; somebody else's attempt answers
 * 404, as an unknown one does — the caller should not learn it exists. 409 `NOT_REVIEWED`
 * before a verdict. Callers must include the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/attempts/:attemptId/assist-review')
export class InternalAssistReviewController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async get(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Query('userId') userId?: string,
  ): Promise<AssistReviewedWork> {
    if (!userId) throw new UnprocessableEntityException('userId is required');

    const result: Result<Attempt, GetAttemptByIdError> = await this.queryBus.execute(
      new GetAttemptByIdQuery(attemptId, userId),
    );
    if (result.isFail) throw new NotFoundException('Attempt not found');

    const work = toAssistReviewedWork(result.value);
    if (!work) throw new ConflictException({ code: 'NOT_REVIEWED' });
    return work;
  }
}

/** Which course a learner's attempt belongs to — known before its verdict, unlike the work. */
export interface AssistAttemptScope {
  attemptId: string;
  exerciseId: string;
  courseId: string | null;
}

/**
 * The assistant settles who pays for a question about a submission, and whether the learner
 * still holds its course, from the attempt's course (plan 83, step 3) — also while the work
 * waits for review, when `assist-review` answers 409. Same rules: the caller names the
 * learner, somebody else's attempt is 404. Callers must include the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/attempts/:attemptId/assist-scope')
export class InternalAssistScopeController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async get(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Query('userId') userId?: string,
  ): Promise<AssistAttemptScope> {
    if (!userId) throw new UnprocessableEntityException('userId is required');

    const result: Result<Attempt, GetAttemptByIdError> = await this.queryBus.execute(
      new GetAttemptByIdQuery(attemptId, userId),
    );
    if (result.isFail) throw new NotFoundException('Attempt not found');

    const attempt = result.value;
    return { attemptId: attempt.id, exerciseId: attempt.exerciseId, courseId: attempt.containerId };
  }
}
