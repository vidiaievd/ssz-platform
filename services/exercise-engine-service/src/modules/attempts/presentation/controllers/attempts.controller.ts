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
  ApiExtraModels,
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
import { RevealAnswersCommand } from '../../application/commands/reveal-answers/reveal-answers.command.js';
import { SelfCheckCommand } from '../../application/commands/self-check/self-check.command.js';
import type {
  SelfCheckError,
  SelfCheckResult,
} from '../../application/commands/self-check/self-check.handler.js';
import type {
  RevealAnswersError,
  RevealAnswersResult,
} from '../../application/commands/reveal-answers/reveal-answers.handler.js';
import type { AbandonAttemptError } from '../../application/commands/abandon-attempt/abandon-attempt.handler.js';
import { GetAttemptByIdQuery } from '../../application/queries/get-attempt-by-id/get-attempt-by-id.query.js';
import type { GetAttemptByIdError } from '../../application/queries/get-attempt-by-id/get-attempt-by-id.handler.js';
import { ListUserAttemptsQuery } from '../../application/queries/list-user-attempts/list-user-attempts.query.js';
import type { ListUserAttemptsResult } from '../../application/queries/list-user-attempts/list-user-attempts.handler.js';
import { StartAttemptRequestDto, StartAttemptResponseDto } from '../dto/start-attempt.dto.js';
import { SubmitAnswerRequestDto, SubmitAnswerResponseDto } from '../dto/submit-answer.dto.js';
import {
  SelfCheckItemDto,
  SelfCheckRequestDto,
  SelfCheckResponseDto,
  TranslateSelfCheckItemDto,
} from '../dto/self-check.dto.js';
import { AttemptResponseDto, ListAttemptsResponseDto } from '../dto/attempt-response.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ContentClientError } from '../../../../shared/application/ports/content-client.port.js';
import { ValidationError } from '../../../../shared/application/ports/answer-validator.port.js';
import type { Attempt, AttemptStatus } from '../../domain/entities/attempt.entity.js';

/**
 * Reading an attempt back includes what the learner answered — without it the record
 * is a score with nothing behind it, and the client cannot show them their own work.
 *
 * `validationDetails` is not equally safe to hand back: validators are free to put the
 * expected answer in there (`multiple_choice.validator.ts` does, as `details.expected`),
 * and a GRADED attempt is precisely the case where the client was never shipped the
 * answers. So details ride along for PRACTICE, where the client already had them, and
 * are withheld for GRADED. `submittedAnswer` carries no such risk — it is the learner's
 * own input.
 */
function toAttemptDto(attempt: Attempt): AttemptResponseDto {
  const isPractice = attempt.checkMode === 'PRACTICE';

  return {
    checkMode: attempt.checkMode,
    submittedAnswer: attempt.submittedAnswer ?? null,
    validationDetails: isPractice ? (attempt.validationDetails ?? null) : null,
    answersRevealed: attempt.answersRevealed,
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
    // The teacher's verdict travels to the learner whatever the check mode: it holds no
    // answer key, and withholding it would leave a marked submission looking unmarked.
    reviewComment: attempt.reviewComment,
    reviewDecisions: attempt.reviewDecisions ?? null,
    reviewedAt: attempt.reviewedAt?.toISOString() ?? null,
    reviewedByUserId: attempt.reviewedByUserId,
  };
}

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('exercises/:exerciseId/attempts')
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
          dto.mode ?? (dto.assignmentId ? 'GRADED' : 'PRACTICE'),
        ),
      );

    if (result.isFail) {
      const err = result.error;
      if (err instanceof ContentClientError) {
        if (err.statusCode === 404) throw new NotFoundException(err.message);
        throw new UnprocessableEntityException(err.message);
      }
      if ('code' in err && err.code === 'ALREADY_IN_PROGRESS') {
        // The id goes in a field, not only in the sentence: a caller re-opening
        // the exercise has to be able to act on it, and parsing prose for an
        // identifier is a bug waiting for someone to reword the message.
        throw new ConflictException({
          message: 'Attempt already in progress',
          attemptId: err.attemptId,
        });
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

  @Post(':attemptId/reveal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Show the answers for a submitted attempt (word_bank_gap_fill and match_pairs)',
  })
  @ApiResponse({ status: 200, description: 'Answers, and the note on why each is right' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({ status: 422, description: 'Nothing submitted yet, or template has no reveal' })
  async revealAnswers(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RevealAnswersResult> {
    const result: Result<RevealAnswersResult, RevealAnswersError> =
      await this.commandBus.execute(new RevealAnswersCommand(attemptId, user.userId));

    if (result.isFail) {
      const err = result.error;
      if ('code' in err) {
        if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
        if (err.code === 'FORBIDDEN') throw new ForbiddenException('Not your attempt');
        if (err.code === 'UNSUPPORTED_TEMPLATE') {
          throw new UnprocessableEntityException(
            'This exercise type does not withhold its answers',
          );
        }
      }
      if (err instanceof ContentClientError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw new UnprocessableEntityException('Cannot reveal answers for this attempt');
    }

    return result.value;
  }

  @Post(':attemptId/self-check')
  @HttpCode(HttpStatus.OK)
  @ApiExtraModels(SelfCheckItemDto, TranslateSelfCheckItemDto)
  @ApiOperation({
    summary: 'Ask how the work is going without handing it in (error correction, translate)',
    description:
      'error_correction: how many mistakes are corrected so far, never which words are ' +
      'wrong. translate_*: how close each sentence is to the key, with the key\'s own ' +
      'words masked. Each call spends one of the exercise\'s self-checks ' +
      '(flow.selfCheck); the attempt stays in progress.',
  })
  @ApiResponse({ status: 200, type: SelfCheckResponseDto })
  @ApiResponse({ status: 400, description: 'Draft answer does not match the template\'s shape' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({
    status: 422,
    description: 'No self-checks left, attempt already submitted, or template has no self-check',
  })
  async selfCheck(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SelfCheckRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SelfCheckResult> {
    const result: Result<SelfCheckResult, SelfCheckError> = await this.commandBus.execute(
      new SelfCheckCommand(attemptId, user.userId, dto.draftAnswer),
    );

    if (result.isFail) {
      const err = result.error;
      if ('code' in err) {
        if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
        if (err.code === 'FORBIDDEN') throw new ForbiddenException('Not your attempt');
        if (err.code === 'SCHEMA_MISMATCH') {
          throw new BadRequestException(
            'Draft answer must carry the work so far in this template\'s shape',
          );
        }
        if (err.code === 'UNSUPPORTED_TEMPLATE') {
          throw new UnprocessableEntityException('This exercise type has no self-check');
        }
      }
      if (err instanceof ContentClientError) {
        throw new UnprocessableEntityException(err.message);
      }
      // The domain's own words: no checks left, or the answer is already in.
      throw new UnprocessableEntityException(
        err instanceof Error ? err.message : 'Cannot self-check this attempt',
      );
    }

    return result.value;
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
