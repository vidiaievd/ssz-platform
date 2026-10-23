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
import { PutAiDraftCommand } from '../../application/commands/put-ai-draft/put-ai-draft.command.js';
import type { PutAiDraftError } from '../../application/commands/put-ai-draft/put-ai-draft.handler.js';
import type { AttemptAiDraft } from '../../domain/entities/attempt-ai-draft.entity.js';
import { PutAiDraftDto } from '../dto/put-ai-draft.dto.js';

const REFUSALS: Record<Exclude<PutAiDraftError['code'], 'ATTEMPT_NOT_FOUND'>, string> = {
  ATTEMPT_NOT_IN_REVIEW: 'The submission is not waiting for review',
  NO_TEACHER_REVIEW: 'No teacher reviews this submission',
  DRAFT_DECIDED: 'The teacher already acted on the draft of this submission',
  AI_CALL_ID_REUSED: 'This aiCallId already holds a draft of another submission',
};

/**
 * Where ai-service leaves a model's draft review of a submission (plan 79, step 1.2).
 * Service-to-service only: `x-internal-token`, not routed by the gateway. Callers must
 * include the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/attempts/:attemptId/ai-draft')
export class InternalAiDraftsController {
  constructor(private readonly commandBus: CommandBus) {}

  /** 200 with the stored draft — the one just written, or the same call's earlier write. */
  @Put()
  @HttpCode(HttpStatus.OK)
  async put(@Param('attemptId', ParseUUIDPipe) attemptId: string, @Body() dto: PutAiDraftDto) {
    const result: Result<AttemptAiDraft, PutAiDraftError> = await this.commandBus.execute(
      new PutAiDraftCommand(attemptId, dto.capability, {
        status: dto.status === 'ready' ? 'READY' : 'FAILED',
        // A failed call leaves no text behind, whatever was sent.
        items: dto.status === 'ready' ? dto.items.map((i) => ({ ...i, suggestion: i.suggestion ?? null })) : [],
        summary: dto.status === 'ready' ? (dto.summary ?? null) : null,
        // An empty list is no marks, as storage reads it.
        marks: dto.status === 'ready' && dto.marks && dto.marks.length > 0 ? dto.marks : null,
        errorCode: dto.errorCode ?? null,
        providerId: dto.providerId ?? null,
        modelId: dto.modelId ?? null,
        promptVersion: dto.promptVersion ?? null,
        aiCallId: dto.aiCallId,
      }),
    );
    if (result.isFail) {
      const { code } = result.error;
      if (code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException(`Attempt ${attemptId} not found`);
      throw new UnprocessableEntityException({ code, message: REFUSALS[code] });
    }
    return toResponse(result.value);
  }
}

function toResponse(draft: AttemptAiDraft) {
  return {
    id: draft.id,
    attemptId: draft.attemptId,
    capability: draft.capability,
    status: draft.status.toLowerCase(),
    items: draft.items,
    summary: draft.summary,
    marks: draft.marks,
    errorCode: draft.errorCode,
    providerId: draft.providerId,
    modelId: draft.modelId,
    promptVersion: draft.promptVersion,
    aiCallId: draft.aiCallId,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}
