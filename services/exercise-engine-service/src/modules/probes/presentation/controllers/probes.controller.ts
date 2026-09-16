import {
  Body,
  ConflictException,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import { CreateProbeCommand } from '../../application/commands/create-probe/create-probe.command.js';
import type { CreateProbeError } from '../../application/commands/create-probe/create-probe.handler.js';
import { DiscardProbeCommand } from '../../application/commands/discard-probe/discard-probe.command.js';
import type { DiscardProbeError } from '../../application/commands/discard-probe/discard-probe.handler.js';
import { PromoteProbeCommand } from '../../application/commands/promote-probe/promote-probe.command.js';
import type {
  PromoteProbeError,
  PromoteProbeResult,
} from '../../application/commands/promote-probe/promote-probe.handler.js';
import { GetProbeQuery } from '../../application/queries/get-probe/get-probe.query.js';
import type { GetProbeError } from '../../application/queries/get-probe/get-probe.handler.js';
import { ListMyProbesQuery } from '../../application/queries/list-my-probes/list-my-probes.query.js';
import type { ProbeTask } from '../../domain/entities/probe-task.entity.js';
import {
  ProbeAlreadyPromotedError,
  ProbeExpiredError,
  ProbeNotYoursError,
} from '../../domain/exceptions/probe.errors.js';
import {
  CreateProbeRequestDto,
  ListProbesResponseDto,
  ProbeResponseDto,
  PromoteProbeResponseDto,
} from '../dto/probe.dto.js';
import { toProbeResponse } from './probe-response.js';

/**
 * The disposable half of the platform, as a learner meets it (plan 63 phase 9).
 *
 * Everything here is scoped to the caller and nothing takes a user id: a probe is dealt
 * to one person, and this service does no authorising of its own — the question "may this
 * teacher make a task for that student" belongs to whoever knows about schools and
 * groups. A caller who legitimately makes probes for other people is a service, and comes
 * in through `internal/probes`.
 *
 * There is no route here for *answering* one, and that is the design rather than an
 * omission: an attempt on a probe is an ordinary attempt, started at
 * `POST /exercises/{probeId}/attempts` like any other. The engine resolves the definition
 * out of the probe table instead of Content Service, and everything downstream — the
 * validators, the scoring, the event, the evidence on the atom — is the same code.
 */
@ApiTags('probes')
@ApiBearerAuth()
@Controller('probes')
export class ProbesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Make a disposable task for yourself',
    description:
      'A task aimed at one atom, alive for a few hours, that never becomes a catalogue ' +
      'exercise. The body carries the task already written — nothing here composes one.',
  })
  @ApiResponse({ status: 201, type: ProbeResponseDto })
  @ApiResponse({ status: 422, description: 'The engine cannot score that template' })
  async createForSelf(
    @Body() dto: CreateProbeRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProbeResponseDto> {
    const result: Result<ProbeTask, CreateProbeError> = await this.commandBus.execute(
      new CreateProbeCommand(
        user.userId,
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
        'manual',
        user.userId,
      ),
    );

    if (result.isFail) throw new UnprocessableEntityException(result.error.message);
    return toProbeResponse(result.value);
  }

  @Get()
  @ApiOperation({ summary: 'The probes still open for you, soonest to expire first' })
  @ApiResponse({ status: 200, type: ListProbesResponseDto })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<ListProbesResponseDto> {
    const probes: ProbeTask[] = await this.queryBus.execute(
      new ListMyProbesQuery(user.userId, Math.min(Math.max(limit, 1), 100)),
    );
    return { items: probes.map(toProbeResponse) };
  }

  @Get(':probeId')
  @ApiOperation({ summary: 'One probe of yours' })
  @ApiResponse({ status: 200, type: ProbeResponseDto })
  @ApiResponse({ status: 404, description: 'No such probe' })
  @ApiResponse({
    status: 410,
    description:
      'The probe has expired. Distinct from 404 on purpose: a probe that never existed ' +
      'is a bug in whatever handed out the id, while an expired one is the feature ' +
      'working — ask for another.',
  })
  async getOne(
    @Param('probeId') probeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProbeResponseDto> {
    const result: Result<ProbeTask, GetProbeError> = await this.queryBus.execute(
      new GetProbeQuery(probeId, user.userId),
    );

    if (result.isFail) throw probeReadError(result.error);
    return toProbeResponse(result.value);
  }

  @Post(':probeId/promote')
  @ApiOperation({
    summary: 'Keep this one — copy the probe into the catalogue as an exercise',
    description:
      'The task becomes an ordinary exercise, private to you, with the addresses it was ' +
      'built around already on it. The probe itself does not become that exercise and ' +
      'still expires: this records which exercise it became. A probe past its time may ' +
      'still be promoted — the clock is about answering the question, not about whether ' +
      'it was a good one — but a swept one is gone for good.',
  })
  @ApiResponse({ status: 201, type: PromoteProbeResponseDto })
  @ApiResponse({ status: 404, description: 'No such probe' })
  @ApiResponse({ status: 409, description: 'Already promoted — the exercise id is in the body' })
  @ApiResponse({ status: 422, description: 'Content Service would not take it' })
  async promote(
    @Param('probeId') probeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PromoteProbeResponseDto> {
    const result: Result<PromoteProbeResult, PromoteProbeError> = await this.commandBus.execute(
      new PromoteProbeCommand(probeId, user.userId),
    );

    if (result.isFail) {
      const err: PromoteProbeError = result.error;
      if (err === null || err instanceof ProbeNotYoursError) {
        throw new NotFoundException('Probe not found');
      }
      if (err instanceof ProbeAlreadyPromotedError) {
        // The id goes in a field rather than only in the sentence: a caller that raced
        // itself has to be able to open what already exists.
        throw new ConflictException({ message: err.message, exerciseId: err.exerciseId });
      }
      throw new UnprocessableEntityException(err.message);
    }

    return { exerciseId: result.value.exerciseId };
  }

  @Delete(':probeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Throw a probe away',
    description:
      'Records nothing about the atom. Refusing to answer a generated question is not ' +
      'evidence that the learner has forgotten anything.',
  })
  @ApiResponse({ status: 204, description: 'Gone' })
  @ApiResponse({ status: 404, description: 'No such probe' })
  async discard(
    @Param('probeId') probeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result: Result<void, DiscardProbeError> = await this.commandBus.execute(
      new DiscardProbeCommand(probeId, user.userId),
    );

    if (result.isFail) throw probeReadError(result.error);
  }
}

/**
 * Someone else's probe reads as "no such probe", deliberately.
 *
 * A 403 on an id the caller does not own confirms that the id names something, which is
 * the one fact a stranger holding a guessed id should not be handed. The learner's own
 * two outcomes — it is not there, or its time is up — stay distinguishable, which is
 * what a runner actually needs to act on.
 */
function probeReadError(error: ProbeExpiredError | ProbeNotYoursError | null): Error {
  if (error instanceof ProbeExpiredError) return new GoneException(error.message);
  if (error instanceof ProbeNotYoursError) return new NotFoundException('Probe not found');
  return new NotFoundException('Probe not found');
}
