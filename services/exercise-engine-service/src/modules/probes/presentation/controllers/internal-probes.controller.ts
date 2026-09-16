import { Body, Controller, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { Result } from '../../../../shared/kernel/result.js';
import { CreateProbeCommand } from '../../application/commands/create-probe/create-probe.command.js';
import type { CreateProbeError } from '../../application/commands/create-probe/create-probe.handler.js';
import { ProbeSweeper } from '../../application/services/probe-sweeper.service.js';
import type { ProbeTask } from '../../domain/entities/probe-task.entity.js';
import {
  CreateProbeForUserRequestDto,
  ProbeResponseDto,
  SweepProbesResponseDto,
} from '../dto/probe.dto.js';
import { toProbeResponse } from './probe-response.js';

/**
 * Where the generator connects (plan 63 phase 9).
 *
 * The LLM loop that will write these tasks is out of scope for this phase — what is
 * built here is the place it plugs into, and the evidence path from a disposable task to
 * an atom. Until it exists, this route is also how a service that knows about schools and
 * groups makes a probe for someone other than the caller: the engine does no authorising
 * of its own, so naming another learner is a thing only a trusted service may do.
 *
 * `@Public` exempts these from the global JwtAuthGuard; `InternalAuthGuard` takes over,
 * and it reads `x-internal-token` — the same header the rest of the platform's
 * service-to-service calls carry, except Learning Service's, which wants
 * `x-service-token` (plan 63 phase 8 found that out the hard way).
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/probes')
export class InternalProbesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly sweeper: ProbeSweeper,
  ) {}

  @Post()
  async createForUser(@Body() dto: CreateProbeForUserRequestDto): Promise<ProbeResponseDto> {
    const result: Result<ProbeTask, CreateProbeError> = await this.commandBus.execute(
      new CreateProbeCommand(
        dto.userId,
        dto.subject,
        dto.requiredModality,
        {
          templateCode: dto.templateCode,
          targetLanguage: dto.targetLanguage,
          difficultyLevel: dto.difficultyLevel,
          content: dto.content,
          expectedAnswers: dto.expectedAnswers ?? null,
          answerCheckSettings: dto.answerCheckSettings ?? null,
          instruction: dto.instruction
            ? {
                language: dto.instruction.language,
                text: dto.instruction.text,
                hint: dto.instruction.hint ?? null,
                overrides: null,
              }
            : null,
        },
        dto.skills ?? [],
        dto.focus ?? [],
        dto.targets?.map((t) => ({
          itemKey: t.itemKey ?? null,
          atomType: t.atomType,
          atomId: t.atomId,
          role: t.role,
        })) ?? null,
        dto.ttlSeconds ?? null,
        // A service calling in is the generator unless it says otherwise. The caller is
        // recorded as nobody: `createdByUserId` names a person who asked, and a service
        // acting on a schedule is not one.
        dto.source ?? 'generated',
        null,
      ),
    );

    if (result.isFail) throw new UnprocessableEntityException(result.error.message);
    return toProbeResponse(result.value);
  }

  /**
   * Clear out what has expired, now.
   *
   * The sweep normally rides on probe creation, which is enough while probes are being
   * made. This is for the case that is not covered by that — a burst of tasks followed by
   * a quiet week — and for an operator who wants the table tidy without waiting.
   */
  @Post('sweep')
  async sweep(): Promise<SweepProbesResponseDto> {
    return { deleted: await this.sweeper.sweep() };
  }
}
