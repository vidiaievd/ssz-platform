import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
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
import { ApiClientTimeHeaders, ClientTime } from '../../../../common/decorators/client-time.decorator.js';
import type { ClientTimeClaim } from '../../../../shared/application/services/client-time.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { StartAttemptCommand } from '../../application/commands/start-attempt/start-attempt.command.js';
import type {
  StartAttemptResult,
  StartAttemptError,
} from '../../application/commands/start-attempt/start-attempt.handler.js';
import { questionStatesOf, segmentStatesOf } from '../../application/services/item-states.js';
import { isRecordingRefusal } from '../../application/services/read-aloud-recordings.js';
import { SubmitAnswerCommand } from '../../application/commands/submit-answer/submit-answer.command.js';
import type { SubmitAnswerResult, SubmitAnswerError } from '../../application/commands/submit-answer/submit-answer.handler.js';
import { AbandonAttemptCommand } from '../../application/commands/abandon-attempt/abandon-attempt.command.js';
import { RevealAnswersCommand } from '../../application/commands/reveal-answers/reveal-answers.command.js';
import { SaveDraftCommand } from '../../application/commands/save-draft/save-draft.command.js';
import type { SaveDraftError, SaveDraftResult } from '../../application/commands/save-draft/save-draft.handler.js';
import { SaveDraftRequestDto, SaveDraftResponseDto } from '../dto/save-draft.dto.js';
import { SelfCheckCommand } from '../../application/commands/self-check/self-check.command.js';
import { AnswerQuestionCommand } from '../../application/commands/answer-question/answer-question.command.js';
import { HandOutProbeCommand } from '../../application/commands/hand-out-probe/hand-out-probe.command.js';
import type {
  HandedOutProbe,
  HandOutProbeError,
} from '../../application/commands/hand-out-probe/hand-out-probe.handler.js';
import { HandOutProbeResponseDto } from '../dto/hand-out-probe.dto.js';
import type { AnswerPayload } from '../../application/commands/answer-question/answer-question.command.js';
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
import { GetProbeHistoryQuery } from '../../application/queries/get-probe-history/get-probe-history.query.js';
import type {
  GetProbeHistoryError,
  ProbeHistory,
} from '../../application/queries/get-probe-history/get-probe-history.handler.js';
import { ProbeHistoryResponseDto } from '../dto/probe-history.dto.js';
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
  AnswerQuestionChoiceResultDto,
  AnswerQuestionElementDto,
  AnswerQuestionProbeResultDto,
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
import { DomainError } from '../../../../shared/domain/domain.error.js';
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
  const pending = attempt.pendingAiVerdict();

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
    // And again for a `multiple_choice` set: which questions are finished, which options
    // are dimmed, and — the one that carries the marks — which try each was taken on.
    // No key can reach it: these are the options the student chose, not the right ones.
    pickedOptions: attempt.pickedOptions.map(
      ({ questionId, picks, eliminated, correct, closed, revealed }) => ({
        questionId,
        picks,
        eliminated,
        correct,
        closed,
        revealed,
      }),
    ),
    // And for a `highlight_in_text` exercise: which questions are closed and how many checks
    // each has spent — the first check of each is the evidence, so a reload must not replay
    // it (plan 67, §8 caveat 7). Read from the attempt's details whatever its mode: these are
    // counts and flags, never a span of the key.
    questionStates: questionStatesOf(attempt),
    // And for a `dictation` exercise, per segment (plan 68 §3.4): the same counts and flags,
    // the last checked text — the learner's own — and the first check's corrected line, which
    // that check already showed them.
    segmentStates: segmentStatesOf(attempt),
    id: attempt.id,
    userId: attempt.userId,
    exerciseId: attempt.exerciseId,
    assignmentId: attempt.assignmentId,
    enrollmentId: attempt.enrollmentId,
    schoolId: attempt.schoolId,
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
    // them from a key into an explanation. A model's verdict on the work of a learner
    // nobody reviews is a delivered one too (plan 79, 2.3): its marks are the grade. So is
    // a model's provisional one at a school (plan 80) — the learner is reading its marks,
    // which come with `…/ai-review`; the attempt has none of its own until one counts.
    ...(attempt.reviewedBy === null
      ? {
          rubricMarks: null,
          rubricSnapshot: pending === null ? null : attempt.rubricSnapshot,
        }
      : { rubricMarks: attempt.rubricMarks, rubricSnapshot: attempt.rubricSnapshot }),
    reviewedAt: attempt.reviewedAt?.toISOString() ?? null,
    reviewedByUserId: attempt.reviewedByUserId,
    reviewedBy: attempt.reviewedBy,
    provisionalVerdict:
      pending === null
        ? null
        : {
            outcome: pending.outcome,
            comment: pending.comment,
            at: pending.at.toISOString(),
            countsAt: pending.countsAt?.toISOString() ?? null,
          },
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
  @ApiResponse({
    status: 422,
    description:
      'minimal_pairs: `MP_SITTINGS_SPENT` — the sittings the author allows are used; ' +
      '`MP_EMPTY_SET` — no pair has audio to play; `MP_DRAW_INVALID` — a dealt draw the ' +
      'document could not have made',
  })
  @ApiClientTimeHeaders()
  async startAttempt(
    @Param('exerciseId') exerciseId: string,
    @Body() dto: StartAttemptRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @ClientTime() clientTime: ClientTimeClaim | null,
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
          dto.joinAttemptId ?? null,
          dto.lessonId ?? null,
          dto.probeDraw ?? null,
          clientTime,
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
      // A code beside the sentence, as above: the runner turns this one into «Du har brukt alle
      // N rundene» and switches «Ny runde» off (plan 72, Q4-A).
      if ('code' in err && err.code === 'MP_SITTINGS_SPENT') {
        throw new UnprocessableEntityException({
          message: 'All the sittings this exercise allows are used',
          code: 'MP_SITTINGS_SPENT',
          allowed: err.allowed,
        });
      }
      if ('code' in err && err.code === 'MP_EMPTY_SET') {
        throw new UnprocessableEntityException({
          message: 'This exercise has no pair with audio to play',
          code: 'MP_EMPTY_SET',
        });
      }
      // A draw dealt on the phone (VoxOrd offline plan, B6). The conflict carries the open
      // sitting's id under a code of its own, so a client that joins on any 409 with an
      // `attemptId` does not join a sitting whose probes are not the ones it answered.
      if ('code' in err && err.code === 'MP_DRAW_NOT_ACCEPTED') {
        throw new BadRequestException({
          message: 'A dealt draw is taken only by a minimal_pairs sitting in PRACTICE',
          code: 'MP_DRAW_NOT_ACCEPTED',
        });
      }
      if ('code' in err && err.code === 'MP_DRAW_INVALID') {
        throw new UnprocessableEntityException({
          message: 'This exercise could not have dealt that draw',
          code: 'MP_DRAW_INVALID',
          fault: err.fault,
        });
      }
      if ('code' in err && err.code === 'MP_DRAW_CONFLICT') {
        throw new ConflictException({
          message: 'Another sitting of this exercise is open',
          code: 'MP_DRAW_CONFLICT',
          openAttemptId: err.attemptId,
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
  @ApiResponse({
    status: 422,
    description:
      'Validation error or invalid state transition. read_aloud: { code: RA_RECORDING_MISSING | ' +
      'RA_RECORDING_UNKNOWN_PROMPT | RA_RECORDING_DUPLICATE | RA_RECORDING_NOT_FOUND | ' +
      'RA_RECORDING_NOT_READY | RA_RECORDING_FAILED | RA_RECORDING_LENGTH, itemIds }',
  })
  @ApiResponse({ status: 429, description: 'A dictation segment checked again too soon' })
  @ApiResponse({
    status: 503,
    description:
      'read_aloud: media-service did not answer, so the recordings could not be checked. ' +
      'Nothing was written — the draft is intact; submit again.',
  })
  @ApiClientTimeHeaders()
  async submitAnswer(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SubmitAnswerRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @ClientTime() clientTime: ClientTimeClaim | null,
  ): Promise<SubmitAnswerResponseDto> {
    const result: Result<SubmitAnswerResult, SubmitAnswerError> =
      await this.commandBus.execute(
        new SubmitAnswerCommand(
          attemptId,
          user.userId,
          dto.submittedAnswer,
          dto.timeSpentSeconds,
          dto.locale ?? 'en',
          clientTime,
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
        // A `dictation` segment checked again inside two seconds (plan 68, Q4-A; AC-X6). The
        // runner holds «Sjekk» for that long, so only a script ever sees this.
        if (err.code === 'DICT_TOO_FAST') {
          throw new HttpException((err as ValidationError).message, HttpStatus.TOO_MANY_REQUESTS);
        }
        // A `read_aloud` whose recordings do not stand up (plan 70 §3.5, RA-U9): the code and
        // the prompts it is about, so the runner can point at the take to record again.
        if (isRecordingRefusal(err)) {
          throw new UnprocessableEntityException({
            code: err.code,
            message: err.message,
            itemIds: err.itemIds,
          });
        }
        if (err.code === 'MEDIA_UNAVAILABLE') {
          throw new ServiceUnavailableException({
            code: 'MEDIA_UNAVAILABLE',
            message: 'The recordings could not be checked right now — try again',
          });
        }
      }
      if (err instanceof ContentClientError) {
        throw new UnprocessableEntityException(err.message);
      }
      // The domain's own words — «No checks left on this attempt (1 allowed)», «already
      // submitted» — as `/answers` already gives them. They name the attempt's state, never
      // the key, and a client told only «Failed» cannot tell a spent budget from a bug.
      if (err instanceof DomainError) {
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
  @ApiExtraModels(
    AnswerQuestionElementDto,
    AnswerQuestionResultDto,
    AnswerQuestionChoiceResultDto,
    AnswerQuestionProbeResultDto,
  )
  @ApiOperation({
    summary: 'Hand in one question of a set',
    description:
      'short_answer and multiple_choice. Both are answered a question at a time and both ' +
      'are graded on the server, for the same reason: what the answer is matched against ' +
      'is the answer. Send `text` for a short-answer set — each answer is final and the ' +
      'same question cannot be answered again. Send `optionId` for a multiple-choice set — ' +
      'a question has an attempt budget, and the key comes back only once it closes ' +
      '(right, revealed, or out of tries); send `reveal` instead of an option to close it ' +
      'and be shown the answer. Send `optionId` for a minimal-pairs probe too, naming the ' +
      'probe handed out by POST /items (`p<n>`): one try, or two with a second chance, and ' +
      'the key, the spelling and the A/B links come back only once it closes. The attempt ' +
      'stays in progress; POST /submit closes it with every answer in one aggregate and ' +
      'regrades all of them.',
  })
  @ApiResponse({ status: 200, type: AnswerQuestionResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Empty answer, no such question in the set, or not one of the probe’s options',
  })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({
    status: 422,
    description:
      'Question already answered or closed, a probe that is not the current one, attempt no ' +
      'longer in progress, or a template that is not answered a question at a time',
  })
  @ApiClientTimeHeaders()
  async answerQuestion(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: AnswerQuestionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @ClientTime() clientTime: ClientTimeClaim | null,
  ): Promise<AnswerQuestionResult> {
    const result: Result<AnswerQuestionResult, AnswerQuestionError> =
      await this.commandBus.execute(
        new AnswerQuestionCommand(
          attemptId,
          user.userId,
          dto.questionId,
          readPayload(dto),
          clientTime,
        ),
      );

    if (result.isFail) {
      const err = result.error;
      if ('code' in err) {
        if (err.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException('Attempt not found');
        if (err.code === 'FORBIDDEN') throw new ForbiddenException('Not your attempt');
        if (err.code === 'QUESTION_CLOSED') {
          throw new UnprocessableEntityException(
            'This question is finished — it was answered, revealed, or all its attempts are spent',
          );
        }
        if (err.code === 'EMPTY_ANSWER') {
          throw new BadRequestException('An answer cannot be handed in empty');
        }
        if (err.code === 'QUESTION_NOT_FOUND') {
          throw new BadRequestException('This exercise has no such answerable question');
        }
        if (err.code === 'OPTION_NOT_FOUND') {
          throw new BadRequestException('That is not one of this probe’s options');
        }
        if (err.code === 'QUESTION_NOT_CURRENT') {
          throw new UnprocessableEntityException(
            'This is not the probe the sitting is on — ask POST /items for it',
          );
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

  @Post(':attemptId/items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hand out the current probe of a minimal-pairs sitting',
    description:
      'minimal_pairs only (plan 72 §3.6). The probes are drawn when the attempt starts and ' +
      'stay on the server; this hands out the first one not yet closed — a signed link to ' +
      'its clip and its buttons, never which button the clip is. Changes nothing, so a ' +
      'reload asks again and gets the same probe with the tries already spent. Answer it ' +
      'with POST /answers `{questionId, optionId}`; once every probe is closed, POST /submit.',
  })
  @ApiResponse({ status: 200, type: HandOutProbeResponseDto })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  @ApiResponse({ status: 403, description: 'Not your attempt' })
  @ApiResponse({
    status: 422,
    description:
      'Not a probe set, attempt not in progress, or all probes closed (`ALL_PROBES_CLOSED` — submit)',
  })
  @ApiResponse({ status: 503, description: 'The clip cannot be played right now; nothing was recorded' })
  async handOutProbe(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HandedOutProbe> {
    const result: Result<HandedOutProbe, HandOutProbeError> = await this.commandBus.execute(
      new HandOutProbeCommand(attemptId, user.userId),
    );

    if (result.isFail) {
      const err = result.error;
      if (err instanceof ContentClientError) {
        if (err.statusCode === 404) throw new NotFoundException(err.message);
        throw new UnprocessableEntityException(err.message);
      }
      switch (err.code) {
        case 'ATTEMPT_NOT_FOUND':
          throw new NotFoundException('Attempt not found');
        case 'FORBIDDEN':
          throw new ForbiddenException('Not your attempt');
        case 'NOT_A_PROBE_SET':
          throw new UnprocessableEntityException({
            message: 'This attempt has no probes to hand out',
            code: 'NOT_A_PROBE_SET',
          });
        case 'NOT_IN_PROGRESS':
          throw new UnprocessableEntityException({
            message: 'This attempt is no longer in progress',
            code: 'NOT_IN_PROGRESS',
          });
        case 'ALL_PROBES_CLOSED':
          throw new UnprocessableEntityException({
            message: 'Every probe is answered — submit the attempt',
            code: 'ALL_PROBES_CLOSED',
          });
        case 'MEDIA_UNAVAILABLE':
          throw new ServiceUnavailableException({
            message: 'The clip cannot be played right now',
            code: 'MEDIA_UNAVAILABLE',
          });
      }
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
  @ApiClientTimeHeaders()
  async checkRow(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: CheckRowRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @ClientTime() clientTime: ClientTimeClaim | null,
  ): Promise<CheckRowResult> {
    const result: Result<CheckRowResult, CheckRowError> = await this.commandBus.execute(
      new CheckRowCommand(
        attemptId,
        user.userId,
        dto.rowId,
        dto.placement,
        dto.reveal === true,
        clientTime,
      ),
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
  @ApiClientTimeHeaders()
  async saveDraft(
    @Param('exerciseId') _exerciseId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SaveDraftRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @ClientTime() clientTime: ClientTimeClaim | null,
  ): Promise<SaveDraftResponseDto> {
    const result: Result<SaveDraftResult, SaveDraftError> = await this.commandBus.execute(
      new SaveDraftCommand(attemptId, user.userId, dto.draftAnswer, clientTime),
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

  // Declared before `:attemptId`, whose UUID pipe would otherwise refuse this path.
  @Get('probe-history')
  @ApiOperation({
    summary: "The learner's own minimal-pairs record in this exercise's language",
    description:
      'minimal_pairs only (VoxOrd offline plan, B6). The probe records of the learner\'s latest ' +
      'scored sittings of any minimal_pairs exercise in the same language — what the engine ' +
      'reads to deal a `weakest` sitting — so a phone can deal one with no network.',
  })
  @ApiQuery({ name: 'language', required: false, description: "The learner's language (default `en`)" })
  @ApiResponse({ status: 200, type: ProbeHistoryResponseDto })
  @ApiResponse({ status: 404, description: 'Exercise not found' })
  @ApiResponse({ status: 422, description: '`NOT_A_PROBE_SET` — not a minimal_pairs exercise' })
  async getProbeHistory(
    @Param('exerciseId') exerciseId: string,
    @Query('language') language: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProbeHistoryResponseDto> {
    const result: Result<ProbeHistory, GetProbeHistoryError> = await this.queryBus.execute(
      new GetProbeHistoryQuery(user.userId, exerciseId, language ?? 'en'),
    );
    if (result.isFail) {
      const err = result.error;
      if (err instanceof ContentClientError) {
        if (err.statusCode === 404) throw new NotFoundException(err.message);
        throw new UnprocessableEntityException(err.message);
      }
      throw new UnprocessableEntityException({
        message: 'Not a minimal_pairs exercise',
        code: 'NOT_A_PROBE_SET',
      });
    }
    return result.value;
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

/**
 * The body, read as the payload the attempt's own template is answered with.
 *
 * The kind is decided here rather than by the caller naming it: a client that could
 * choose would be choosing which judge runs, and the attempt already knows. `reveal`
 * marks the body as a pick even with no option in it — it is the one multiple-choice
 * action that hands in nothing.
 */
function readPayload(dto: AnswerQuestionRequestDto): AnswerPayload {
  if (dto.optionId !== undefined || dto.reveal === true) {
    return { kind: 'option', optionId: dto.optionId ?? null, reveal: dto.reveal === true };
  }
  return { kind: 'text', text: dto.text ?? '' };
}
