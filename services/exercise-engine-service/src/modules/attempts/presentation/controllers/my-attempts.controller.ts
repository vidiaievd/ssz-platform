import {
  Controller,
  DefaultValuePipe,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { GetAttemptByIdQuery } from '../../application/queries/get-attempt-by-id/get-attempt-by-id.query.js';
import type { GetAttemptByIdError } from '../../application/queries/get-attempt-by-id/get-attempt-by-id.handler.js';
import { ListMyAttemptsQuery } from '../../application/queries/list-my-attempts/list-my-attempts.query.js';
import type { ListMyAttemptsResult } from '../../application/queries/list-my-attempts/list-my-attempts.handler.js';
import { AttemptResponseDto } from '../dto/attempt-response.dto.js';
import { ListMyAttemptsResponseDto } from '../dto/my-attempts.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { Attempt, AttemptStatus } from '../../domain/entities/attempt.entity.js';

function toAttemptDto(attempt: Attempt): AttemptResponseDto {
  return {
    id: attempt.id,
    userId: attempt.userId,
    exerciseId: attempt.exerciseId,
    assignmentId: attempt.assignmentId,
    enrollmentId: attempt.enrollmentId,
    templateCode: attempt.templateCode,
    targetLanguage: attempt.targetLanguage,
    difficultyLevel: attempt.difficultyLevel,
    status: attempt.status,
    score: attempt.scoreValue,
    passed: attempt.passed,
    timeSpentSeconds: attempt.timeSpentSeconds,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    scoredAt: attempt.scoredAt?.toISOString() ?? null,
    feedback: attempt.feedback,
  };
}

@ApiTags('my-attempts')
@ApiBearerAuth()
@Controller('api/v1/attempts')
export class MyAttemptsController {
  constructor(private readonly queryBus: QueryBus) {}

  // Defined before /:attemptId so NestJS matches the literal 'me' first.
  @Get('me')
  @ApiOperation({
    summary: 'List my attempts (all exercises, cursor-paginated)',
    description:
      'Returns the calling user\'s attempts, newest first. Pass the returned `nextCursor` as the `cursor` query parameter to fetch the next page.',
  })
  @ApiQuery({ name: 'exerciseId', required: false, description: 'Filter by exercise ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by attempt status' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size (1–100, default 20)' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Opaque pagination cursor from a previous response',
  })
  @ApiResponse({ status: 200, type: ListMyAttemptsResponseDto })
  async listMyAttempts(
    @Query('exerciseId') exerciseId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListMyAttemptsResponseDto> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const result: ListMyAttemptsResult = await this.queryBus.execute(
      new ListMyAttemptsQuery(
        user.userId,
        exerciseId,
        status as AttemptStatus | undefined,
        safeLimit,
        cursor,
      ),
    );

    return {
      items: result.items.map(toAttemptDto),
      nextCursor: result.nextCursor,
      limit: result.limit,
    };
  }

  @Get(':attemptId')
  @ApiOperation({ summary: 'Get attempt by ID', description: 'Returns the attempt. Only the attempt owner can access it.' })
  @ApiResponse({ status: 200, type: AttemptResponseDto, description: 'Attempt details' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  async getAttemptById(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AttemptResponseDto> {
    const result: Result<Attempt, GetAttemptByIdError> = await this.queryBus.execute(
      new GetAttemptByIdQuery(attemptId, user.userId),
    );

    if (result.isFail) {
      const err = result.error;
      if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
      throw new ForbiddenException('Not your attempt');
    }

    return toAttemptDto(result.value);
  }
}
