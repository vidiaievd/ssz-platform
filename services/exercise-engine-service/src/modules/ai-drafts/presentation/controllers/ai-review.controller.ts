import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import { DisputeAiReviewCommand } from '../../application/commands/dispute-ai-review/dispute-ai-review.command.js';
import type {
  DisputeAiReviewError,
  DisputeAiReviewResult,
} from '../../application/commands/dispute-ai-review/dispute-ai-review.handler.js';
import { GetLearnerAiReviewQuery } from '../../application/queries/get-learner-ai-review/get-learner-ai-review.query.js';
import type {
  GetLearnerAiReviewError,
  LearnerAiReview,
} from '../../application/queries/get-learner-ai-review/get-learner-ai-review.handler.js';
import {
  DisputeAiReviewRequestDto,
  DisputeAiReviewResponseDto,
  LearnerAiReviewResponseDto,
} from '../dto/learner-ai-review.dto.js';

/**
 * A model's review of a learner's own work (plan 79, step 2.3) — for the learner nobody
 * reviews, whose attempt the model closed (`reviewedBy: 'ai'` on the attempt) — and their
 * "this review is wrong" (step 2.3b).
 */
@ApiTags('attempts')
@ApiBearerAuth()
@Controller('exercises/:exerciseId/attempts/:attemptId/ai-review')
export class AiReviewController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: "A model's review of my submission",
    description:
      'The remarks a model wrote on the submission it reviewed, item by item, with its summary and — ' +
      'for an essay graded out of a rubric — the reason behind each mark. Only for an attempt whose ' +
      'verdict came from the model (`reviewedBy: ai`), or that carries its provisional verdict while a ' +
      'school’s teacher is awaited (`provisional: true`); the client must label it as a review by AI.',
  })
  @ApiResponse({ status: 200, type: LearnerAiReviewResponseDto })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({
    status: 404,
    description: 'Attempt not found, or `NO_AI_REVIEW` — no model’s verdict on it (waiting, a teacher’s, none)',
  })
  async get(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LearnerAiReviewResponseDto> {
    const result: Result<LearnerAiReview, GetLearnerAiReviewError> = await this.queryBus.execute(
      new GetLearnerAiReviewQuery(attemptId, user.userId),
    );
    if (result.isFail) refuse(result.error);
    const review = result.value;
    return {
      ...review,
      reviewedAt: review.reviewedAt.toISOString(),
      disputedAt: review.disputedAt?.toISOString() ?? null,
      countsAt: review.countsAt?.toISOString() ?? null,
    };
  }

  @Post('dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Say a model's review of my submission is wrong",
    description:
      'Once per review: a repeat answers with the first time and counts nothing. Changes nothing about ' +
      'the verdict — it tells the platform the model got this one wrong (plan 79, 2.3b).',
  })
  @ApiResponse({ status: 200, type: DisputeAiReviewResponseDto })
  @ApiResponse({ status: 400, description: 'Reason longer than 1000 characters' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({ status: 404, description: 'Attempt not found, or `NO_AI_REVIEW`' })
  async dispute(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: DisputeAiReviewRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DisputeAiReviewResponseDto> {
    const reason = (dto.reason ?? '').trim();
    const result: Result<DisputeAiReviewResult, DisputeAiReviewError> = await this.commandBus.execute(
      new DisputeAiReviewCommand(attemptId, user.userId, reason === '' ? null : reason),
    );
    if (result.isFail) refuse(result.error);
    return { disputedAt: result.value.disputedAt.toISOString() };
  }
}

function refuse(error: GetLearnerAiReviewError | DisputeAiReviewError): never {
  switch (error.code) {
    case 'ATTEMPT_NOT_FOUND':
      throw new NotFoundException('Attempt not found');
    case 'FORBIDDEN':
      throw new ForbiddenException('Not your attempt');
    case 'NO_AI_REVIEW':
      throw new NotFoundException({ code: 'NO_AI_REVIEW', message: 'No model reviewed this submission' });
  }
}
