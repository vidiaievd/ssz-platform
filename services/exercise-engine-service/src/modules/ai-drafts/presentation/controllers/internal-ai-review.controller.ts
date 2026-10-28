import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { Result } from '../../../../shared/kernel/result.js';
import { PutAiReviewCommand } from '../../application/commands/put-ai-review/put-ai-review.command.js';
import type {
  PutAiReviewError,
  PutAiReviewResult,
} from '../../application/commands/put-ai-review/put-ai-review.handler.js';
import { toProposedDraft } from '../dto/put-ai-draft.dto.js';
import { PutAiReviewDto, toHearings } from '../dto/put-ai-review.dto.js';
import { toResponse } from './internal-ai-drafts.controller.js';

type Refusal = Exclude<PutAiReviewError['code'], 'ATTEMPT_NOT_FOUND' | 'CONTENT_UNAVAILABLE' | 'CONCURRENT_WRITE'>;

const REFUSALS: Record<Refusal, string> = {
  ATTEMPT_NOT_IN_REVIEW: 'The submission is not waiting for review',
  HAS_TEACHER_REVIEW: 'A teacher reviews this submission',
  DRAFT_DECIDED: 'The review of this submission was already decided',
  TEMPLATE_NOT_SUPPORTED: 'No review prompt or voice check for this template',
  VERDICT_MISSING: 'A ready review needs its verdict',
  READING_MISSING: 'A ready review of a reading needs what was heard',
  VERDICT_INCOMPLETE: 'The verdict leaves items, criteria or prompts unruled',
  MACHINE_CANNOT_CHECK: 'The exercise no longer lets the machine check this reading',
  EXERCISE_GONE: 'The exercise was deleted',
  RETURN_REQUIRES_COMMENT: 'A returned submission needs a summary',
  AI_CALL_ID_REUSED: 'This aiCallId already holds a draft of another submission',
};

/**
 * Where ai-service leaves a model's review of the work of a learner nobody reviews, with its
 * verdict (plan 79, step 2.1b) — or, for a `read_aloud`, what the recognizer heard in each prompt,
 * from which this service rules itself (plan 82, step 7). Service-to-service only: `x-internal-token`, not routed by the
 * gateway. Callers must include the `/api/v1` prefix.
 *
 * 200 with the stored review and where the attempt now stands; 409 when another write on the
 * attempt landed in between and 503 when content-service is unreachable — the two to retry.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/attempts/:attemptId/ai-review')
export class InternalAiReviewController {
  constructor(private readonly commandBus: CommandBus) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  async put(@Param('attemptId', ParseUUIDPipe) attemptId: string, @Body() dto: PutAiReviewDto) {
    const result: Result<PutAiReviewResult, PutAiReviewError> = await this.commandBus.execute(
      new PutAiReviewCommand(
        attemptId,
        toProposedDraft(dto),
        dto.status === 'ready' && dto.verdict ? dto.verdict : null,
        dto.status === 'ready' && dto.reading ? toHearings(dto.reading) : null,
      ),
    );
    if (result.isFail) {
      const error = result.error;
      switch (error.code) {
        case 'ATTEMPT_NOT_FOUND':
          throw new NotFoundException(`Attempt ${attemptId} not found`);
        case 'CONTENT_UNAVAILABLE':
          throw new ServiceUnavailableException('The exercise could not be read from content-service');
        case 'CONCURRENT_WRITE':
          throw new ConflictException('Another write on this submission landed first');
        case 'VERDICT_INCOMPLETE':
          throw new UnprocessableEntityException({ code: error.code, message: REFUSALS[error.code], missing: error.missing });
        default:
          throw new UnprocessableEntityException({ code: error.code, message: REFUSALS[error.code] });
      }
    }
    const { draft, attempt } = result.value;
    return { review: toResponse(draft), attempt: { ...attempt, status: attempt.status.toLowerCase() } };
  }
}
