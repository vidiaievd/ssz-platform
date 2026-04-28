import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UnprocessableEntityException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  DefaultValuePipe,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { StartAttemptCommand } from '../../application/commands/start-attempt/start-attempt.command.js';
import type { StartAttemptResult, StartAttemptError } from '../../application/commands/start-attempt/start-attempt.handler.js';
import { SubmitAnswerCommand } from '../../application/commands/submit-answer/submit-answer.command.js';
import type { SubmitAnswerResult, SubmitAnswerError } from '../../application/commands/submit-answer/submit-answer.handler.js';
import { AbandonAttemptCommand } from '../../application/commands/abandon-attempt/abandon-attempt.command.js';
import type { AbandonAttemptError } from '../../application/commands/abandon-attempt/abandon-attempt.handler.js';
import { GetAttemptByIdQuery } from '../../application/queries/get-attempt-by-id/get-attempt-by-id.query.js';
import type { GetAttemptByIdError } from '../../application/queries/get-attempt-by-id/get-attempt-by-id.handler.js';
import { ListUserAttemptsQuery } from '../../application/queries/list-user-attempts/list-user-attempts.query.js';
import type { ListUserAttemptsResult } from '../../application/queries/list-user-attempts/list-user-attempts.handler.js';
import { StartAttemptRequestDto, StartAttemptResponseDto } from '../dto/start-attempt.dto.js';
import { SubmitAnswerRequestDto, SubmitAnswerResponseDto } from '../dto/submit-answer.dto.js';
import { AttemptResponseDto, ListAttemptsResponseDto } from '../dto/attempt-response.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ContentClientError } from '../../../../shared/application/ports/content-client.port.js';
import { ValidationError } from '../../../../shared/application/ports/answer-validator.port.js';
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

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('api/v1/exercises/:exerciseId/attempts')
export class AttemptsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start a new exercise attempt' })
  @ApiResponse({ status: 201, type: StartAttemptResponseDto })
  @ApiResponse({ status: 404, description: 'Exercise not found' })
  @ApiResponse({ status: 409, description: 'Attempt already in progress' })
  async startAttempt(
    @Param('exerciseId') exerciseId: string,
    @Body() dto: StartAttemptRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StartAttemptResponseDto> {
    const result: Result<StartAttemptResult, StartAttemptError> =
      await this.commandBus.execute(
        new StartAttemptCommand(
          user.userId,
          exerciseId,
          dto.language,
          dto.assignmentId ?? null,
          dto.enrollmentId ?? null,
        ),
      );

    if (result.isFail) {
      const err = result.error;
      if (err instanceof ContentClientError) {
        if (err.statusCode === 404) throw new NotFoundException(err.message);
        throw new UnprocessableEntityException(err.message);
      }
      if ('code' in err && err.code === 'ALREADY_IN_PROGRESS') {
        throw new ConflictException(`Attempt already in progress: ${err.attemptId}`);
      }
      throw new UnprocessableEntityException('Failed to start attempt');
    }

    return result.value as StartAttemptResponseDto;
  }

  @Post(':attemptId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit an answer for an in-progress attempt' })
  @ApiResponse({ status: 200, type: SubmitAnswerResponseDto })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({ status: 422, description: 'Validation error or invalid state transition' })
  async submitAnswer(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SubmitAnswerRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubmitAnswerResponseDto> {
    const result: Result<SubmitAnswerResult, SubmitAnswerError> =
      await this.commandBus.execute(
        new SubmitAnswerCommand(
          attemptId,
          user.userId,
          dto.submittedAnswer,
          dto.timeSpentSeconds,
          dto.locale ?? 'en',
        ),
      );

    if (result.isFail) {
      const err = result.error;
      if ('code' in err) {
        if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
        if (err.code === 'FORBIDDEN') throw new ForbiddenException('Not your attempt');
        if (err.code === 'SCHEMA_MISMATCH' || err.code === 'UNSUPPORTED_TEMPLATE') {
          throw new BadRequestException((err as ValidationError).message);
        }
      }
      if (err instanceof ContentClientError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw new UnprocessableEntityException('Failed to submit answer');
    }

    return result.value as SubmitAnswerResponseDto;
  }

  @Delete(':attemptId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Abandon an in-progress attempt' })
  @ApiResponse({ status: 204, description: 'Attempt abandoned' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({ status: 422, description: 'Cannot abandon a scored or reviewed attempt' })
  async abandonAttempt(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result: Result<void, AbandonAttemptError> =
      await this.commandBus.execute(
        new AbandonAttemptCommand(attemptId, user.userId),
      );

    if (result.isFail) {
      const err = result.error;
      if ('code' in err) {
        if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
        if (err.code === 'FORBIDDEN') throw new ForbiddenException('Not your attempt');
      }
      throw new UnprocessableEntityException('Cannot abandon attempt in current state');
    }
  }

  @Get(':attemptId')
  @ApiOperation({ summary: 'Get attempt details' })
  @ApiResponse({ status: 200, type: AttemptResponseDto })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  async getAttempt(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AttemptResponseDto> {
    const result: Result<Attempt, GetAttemptByIdError> =
      await this.queryBus.execute(new GetAttemptByIdQuery(attemptId, user.userId));

    if (result.isFail) {
      const err = result.error;
      if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
      throw new ForbiddenException('Not your attempt');
    }

    return toAttemptDto(result.value);
  }

  @Get()
  @ApiOperation({ summary: 'List my attempts for this exercise (paginated)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by attempt status' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (max 100)', type: Number })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset', type: Number })
  @ApiResponse({ status: 200, type: ListAttemptsResponseDto })
  async listAttempts(
    @Param('exerciseId') exerciseId: string,
    @Query('status') status: string | undefined,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListAttemptsResponseDto> {
    const safeLimit = Math.min(limit, 100);
    const result: ListUserAttemptsResult = await this.queryBus.execute(
      new ListUserAttemptsQuery(
        user.userId,
        exerciseId,
        status as AttemptStatus | undefined,
        safeLimit,
        offset,
      ),
    );

    return {
      items: result.items.map(toAttemptDto),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }
}
