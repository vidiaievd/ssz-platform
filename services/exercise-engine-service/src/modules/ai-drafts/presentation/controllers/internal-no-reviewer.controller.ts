import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { Result } from '../../../../shared/kernel/result.js';
import { GiveUpAiReviewCommand } from '../../application/commands/give-up-ai-review/give-up-ai-review.command.js';
import type {
  GiveUpAiReviewError,
  GiveUpAiReviewResult,
} from '../../application/commands/give-up-ai-review/give-up-ai-review.handler.js';
import { GiveUpAiReviewDto } from '../dto/give-up-ai-review.dto.js';

const REFUSALS: Record<Exclude<GiveUpAiReviewError['code'], 'ATTEMPT_NOT_FOUND'>, string> = {
  ATTEMPT_NOT_IN_REVIEW: 'The submission is not waiting for review',
  HAS_TEACHER_REVIEW: 'A teacher reviews this submission',
  REVIEW_EXISTS: 'A model review of this submission is stored; retry its write instead',
};

/**
 * Where ai-service gives up on the work of a learner nobody else reviews (plan 79, step
 * 2.2a): the attempt closes as `NO_REVIEWER`. Service-to-service only: `x-internal-token`,
 * not routed by the gateway. Callers must include the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/attempts/:attemptId/no-reviewer')
export class InternalNoReviewerController {
  constructor(private readonly commandBus: CommandBus) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  async put(@Param('attemptId', ParseUUIDPipe) attemptId: string, @Body() dto: GiveUpAiReviewDto) {
    const result: Result<GiveUpAiReviewResult, GiveUpAiReviewError> = await this.commandBus.execute(
      new GiveUpAiReviewCommand(attemptId, dto.reason, dto.aiCallId ?? null),
    );
    if (result.isFail) {
      const { code } = result.error;
      if (code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException(`Attempt ${attemptId} not found`);
      throw new UnprocessableEntityException({ code, message: REFUSALS[code] });
    }
    return { attempt: { status: result.value.status.toLowerCase() } };
  }
}
