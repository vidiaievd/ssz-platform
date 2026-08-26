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
  Put,
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
import { SaveDraftCommand } from '../../application/commands/save-draft/save-draft.command.js';
import type { SaveDraftError, SaveDraftResult } from '../../application/commands/save-draft/save-draft.handler.js';
import { SaveDraftRequestDto, SaveDraftResponseDto } from '../dto/save-draft.dto.js';
import { SelfCheckCommand } from '../../application/commands/self-check/self-check.command.js';
import { AnswerQuestionCommand } from '../../application/commands/answer-question/answer-question.command.js';
import { CheckRowCommand } from '../../application/commands/check-row/check-row.command.js';
import type {
  AnswerQuestionError,
  AnswerQuestionResult,
} from '../../application/commands/answer-question/answer-question.handler.js';
import type {
  CheckRowError,
  CheckRowResult,
} from '../../application/commands/check-row/check-row.handler.js';
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
import {
  AnswerQuestionElementDto,
  AnswerQuestionRequestDto,
  AnswerQuestionResponseDto,
  AnswerQuestionResultDto,
} from '../dto/answer-question.dto.js';
import {
  CheckRowRequestDto,
  CheckRowResponseDto,
  CheckRowResultDto,
} from '../dto/check-row.dto.js';
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
export function toAttemptDto(attempt: Attempt): AttemptResponseDto {
  const isPractice = attempt.checkMode === 'PRACTICE';

  return {
    checkMode: attempt.checkMode,
    submittedAnswer: attempt.submittedAnswer ?? null,
    validationDetails: isPractice ? (attempt.validationDetails ?? null) : null,
    answersRevealed: attempt.answersRevealed,
    // The learner's own unfinished text, read back to them — the same reasoning as
    // `submittedAnswer`, and no answer key can reach it: nothing but the client ever
    // writes this column.
    draftAnswer: attempt.draftAnswer,
    draftSavedAt: attempt.draftSavedAt?.toISOString() ?? null,
    // Handed-in questions of a `short_answer` set, read back the same way and for the
    // same reason as the draft above: it is the learner's own work, and a runner
    // re-entering the set has no other way to know which questions are already closed
    // (plan 51 §8 Q6). No key can reach it — the anchor phrases are never written here.
    answeredQuestions: attempt.answeredQuestions.map(({ questionId, text, verdict }) => ({
      questionId,
      text,
      verdict,
    })),
    // The same again for a `sentence_schema` set: the boards as last checked, and which
    // sentences are closed. `revealed` is the one that has to survive a reload — a
    // sentence the student was shown must not reopen as one they can still solve.
    checkedRows: attempt.checkedRows.map(({ rowId, attempts, placement, solved, revealed }) => ({
      rowId,
      attempts,
      placement,
      solved,
      revealed,
    })),
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
    // The rubric behind the mark, and only once there is a mark. The criteria carry
    // their level descriptors, which sit in the answer key precisely because a learner
    // must not read them while writing (plan 50 §4); a delivered verdict is what turns
    // them from a key into an explanation. `deliveredVerdict()` is the same reading the
    // review screen uses, so the two cannot disagree about whether this is graded.
    ...(attempt.deliveredVerdict() === null
      ? { rubricMarks: null, rubricSnapshot: null }
      : { rubricMarks: attempt.rubricMarks, rubricSnapshot: attempt.rubricSnapshot }),
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

  @Post(':attemptId/answers')
  @HttpCode(HttpStatus.OK)
  @ApiExtraModels(AnswerQuestionElementDto, AnswerQuestionResultDto)
  @ApiOperation({
    summary: 'Hand in one question of a short-answer set',
    description:
      'short_answer only. The set is answered a question at a time and each answer is ' +
      'final: the verdict comes back at once and the same question cannot be answered ' +
      'again. Graded on the server, because the phrases the answer is matched against ' +
      'are the answer. The attempt stays in progress; POST /submit closes it with every ' +
      'answer in one aggregate and regrades all of them.',
  })
  @ApiResponse({ status: 200, type: AnswerQuestionResponseDto })
  @ApiResponse({ status: 400, description: 'Empty answer, or no such question in the set' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({
    status: 422,
    description:
      'Question already answered, attempt no longer in progress, or not a short-answer set',
  })
  async answerQuestion(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: AnswerQuestionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AnswerQuestionResult> {
    const result: Result<AnswerQuestionResult, AnswerQuestionError> =
      await this.commandBus.execute(
        new AnswerQuestionCommand(attemptId, user.userId, dto.questionId, dto.text),
      );

    if (result.isFail) {
      const err = result.error;
      if ('code' in err) {
        if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
        if (err.code === 'FORBIDDEN') throw new ForbiddenException('Not your attempt');
        if (err.code === 'EMPTY_ANSWER') {
          throw new BadRequestException('An answer cannot be handed in empty');
        }
        if (err.code === 'QUESTION_NOT_FOUND') {
          throw new BadRequestException('This exercise has no such answerable question');
        }
        if (err.code === 'UNSUPPORTED_TEMPLATE') {
          throw new UnprocessableEntityException(
            'This exercise is not answered a question at a time',
          );
        }
      }
      if (err instanceof ContentClientError) {
        throw new UnprocessableEntityException(err.message);
      }
      // The domain's own words: already answered, or the set is already in.
      throw new UnprocessableEntityException(
        err instanceof Error ? err.message : 'Cannot answer this question',
      );
    }

    return result.value;
  }

  @Post(':attemptId/rows')
  @HttpCode(HttpStatus.OK)
  @ApiExtraModels(CheckRowResultDto)
  @ApiOperation({
    summary: 'Check one sentence of a sentence-schema set',
    description:
      'sentence_schema only. The set is worked through a sentence at a time and a ' +
      'sentence may be checked as often as the student likes: being wrong is a step in ' +
      'solving, not a verdict. Graded on the server, because which field a piece belongs ' +
      'in is the answer. Pass `reveal` to be shown the sentence instead — it closes and ' +
      'scores nothing. A sentence already solved or revealed is refused. The attempt ' +
      'stays in progress; POST /submit closes it with every board in one aggregate.',
  })
  @ApiResponse({ status: 200, type: CheckRowResponseDto })
  @ApiResponse({ status: 400, description: 'Empty board, or no such sentence in the set' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({
    status: 422,
    description:
      'Sentence already closed, attempt no longer in progress, or not a sentence-schema set',
  })
  async checkRow(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: CheckRowRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CheckRowResult> {
    const result: Result<CheckRowResult, CheckRowError> = await this.commandBus.execute(
      new CheckRowCommand(attemptId, user.userId, dto.rowId, dto.placement, dto.reveal === true),
    );

    if (result.isFail) {
      const err = result.error;
      if ('code' in err) {
        if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
        if (err.code === 'FORBIDDEN') throw new ForbiddenException('Not your attempt');
        if (err.code === 'NOTHING_PLACED') {
          throw new BadRequestException('There is nothing on the board to check');
        }
        if (err.code === 'ROW_NOT_FOUND') {
          throw new BadRequestException('This exercise has no such sentence to solve');
        }
        if (err.code === 'UNSUPPORTED_TEMPLATE') {
          throw new UnprocessableEntityException(
            'This exercise is not worked through a sentence at a time',
          );
        }
      }
      if (err instanceof ContentClientError) {
        throw new UnprocessableEntityException(err.message);
      }
      // The domain's own words: the sentence is already closed, or the set is already in.
      throw new UnprocessableEntityException(
        err instanceof Error ? err.message : 'Cannot check this sentence',
      );
    }

    return result.value;
  }

  @Put(':attemptId/draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autosave the work in progress',
    description:
      'Keeps the unfinished answer so a reload, a closed tab or a dead battery does ' +
      'not cost the learner what they had written. The draft is stored exactly as it ' +
      'arrives and never validated or scored; it comes back on GET /attempts/:id. ' +
      'Submitting reads the submit request, never this.',
  })
  @ApiResponse({ status: 200, type: SaveDraftResponseDto })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({ status: 422, description: 'Attempt is no longer in progress' })
  async saveDraft(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SaveDraftRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SaveDraftResponseDto> {
    const result: Result<SaveDraftResult, SaveDraftError> = await this.commandBus.execute(
      new SaveDraftCommand(attemptId, user.userId, dto.draftAnswer),
    );

    if (result.isFail) {
      const err = result.error;
      if ('code' in err) {
        if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
        if (err.code === 'FORBIDDEN') throw new ForbiddenException('Not your attempt');
      }
      throw new UnprocessableEntityException(
        err instanceof Error ? err.message : 'Cannot save a draft for this attempt',
      );
    }

    return { savedAt: result.value.savedAt };
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
