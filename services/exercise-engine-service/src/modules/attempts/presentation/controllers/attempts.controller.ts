import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnprocessableEntityException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
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
import { StartAttemptRequestDto, StartAttemptResponseDto } from '../dto/start-attempt.dto.js';
import { SubmitAnswerRequestDto, SubmitAnswerResponseDto } from '../dto/submit-answer.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ContentClientError } from '../../../../shared/application/ports/content-client.port.js';
import { ValidationError } from '../../../../shared/application/ports/answer-validator.port.js';

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('api/v1/exercises/:exerciseId/attempts')
export class AttemptsController {
  constructor(private readonly commandBus: CommandBus) {}

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
          dto.locale ?? user.userId, // fall back to userId locale context; real l10n uses Accept-Language
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
}
