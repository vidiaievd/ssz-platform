import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import { GetLearnerAiReviewQuery } from '../../application/queries/get-learner-ai-review/get-learner-ai-review.query.js';
import type {
  GetLearnerAiReviewError,
  LearnerAiReview,
} from '../../application/queries/get-learner-ai-review/get-learner-ai-review.handler.js';
import { LearnerAiReviewResponseDto } from '../dto/learner-ai-review.dto.js';

/**
 * A model's review of a learner's own work (plan 79, step 2.3) — for the learner nobody
 * reviews, whose attempt the model closed (`reviewedBy: 'ai'` on the attempt).
 */
@ApiTags('attempts')
@ApiBearerAuth()
@Controller('exercises/:exerciseId/attempts/:attemptId/ai-review')
export class AiReviewController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: "A model's review of my submission",
    description:
      'The remarks a model wrote on the submission it reviewed, item by item, with its summary and — ' +
      'for an essay graded out of a rubric — the reason behind each mark. Only for an attempt whose ' +
      'verdict came from the model (`reviewedBy: ai`); the client must label it as a review by AI.',
  })
  @ApiResponse({ status: 200, type: LearnerAiReviewResponseDto })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({
    status: 404,
    description: 'Attempt not found, or `NO_AI_REVIEW` — no model’s verdict closed it (waiting, a teacher’s, none)',
  })
  async get(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LearnerAiReviewResponseDto> {
    const result: Result<LearnerAiReview, GetLearnerAiReviewError> = await this.queryBus.execute(
      new GetLearnerAiReviewQuery(attemptId, user.userId),
    );
    if (result.isFail) {
      switch (result.error.code) {
        case 'ATTEMPT_NOT_FOUND':
          throw new NotFoundException('Attempt not found');
        case 'FORBIDDEN':
          throw new ForbiddenException('Not your attempt');
        case 'NO_AI_REVIEW':
          throw new NotFoundException({ code: 'NO_AI_REVIEW', message: 'No model reviewed this submission' });
      }
    }
    const review = result.value;
    return { ...review, reviewedAt: review.reviewedAt.toISOString() };
  }
}
