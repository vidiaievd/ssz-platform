import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminLevel } from '@ssz/contracts';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequireAdminLevel } from '../../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../../common/guards/admin-level.guard.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../../shared/kernel/result.js';
import { RunSweepCommand, type RunSweepResult } from '../../application/commands/run-sweep/run-sweep.command.js';
import { GetSweepsOverviewQuery } from '../../application/queries/get-sweeps-overview/get-sweeps-overview.query.js';
import type { RunSweepError } from '../../domain/run-sweep.errors.js';
import { isSweepKind, SWEEP_KINDS } from '../../domain/sweep-run.js';
import { RunSweepRequestDto, RunSweepResponseDto } from '../dto/run-sweep.dto.js';
import { SweepsOverviewDto } from '../dto/sweeps-overview.dto.js';

/** Media sweeps for the platform admin panel (plan 90, phase 8, steps 3–4). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminLevelGuard)
@RequireAdminLevel(AdminLevel.SUPPORT)
@Controller('admin/media/sweeps')
export class AdminSweepsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'The four media sweeps: schedule, nightly mode, age limit and the last 10 runs of each',
    description:
      'Runs of every origin — nightly, admin panel, operator — with the report as the sweep returned it and a ' +
      'common `summary` (found / kept / deleted). The nightly mode is env `MEDIA_ORPHAN_SWEEP_MODE` and is not ' +
      'changed here. Admin-panel token, level `support` or higher.',
  })
  @ApiOkResponse({ type: SweepsOverviewDto })
  @ApiUnauthorizedResponse({ description: 'No or invalid token' })
  @ApiForbiddenResponse({ description: 'Not platform_admin, or a token without an admin level (`ADMIN_LEVEL_REQUIRED`)' })
  async overview(): Promise<SweepsOverviewDto> {
    return this.queryBus.execute(new GetSweepsOverviewQuery());
  }

  @Post(':kind/run')
  @HttpCode(HttpStatus.OK)
  @RequireAdminLevel(AdminLevel.ADMIN)
  @ApiOperation({
    summary: 'Run one media sweep now',
    description:
      'Synchronous — answers when the sweep is done. `dryRun: true` (level `admin`) only counts and leaves a ' +
      '`sweep_runs` row with trigger `admin`. `dryRun: false` deletes (level `super`, `reason` required) and goes ' +
      'on the admin trail: `admin_audit` + `admin.action.performed` on `media.events` (action ' +
      '`media.sweep.deleted`, target `media_sweep/<kind>`, `after` = the report and `runId`). A kind already ' +
      'running in this process → 409 `SWEEP_RUNNING`, nothing started.',
  })
  @ApiParam({ name: 'kind', enum: SWEEP_KINDS })
  @ApiOkResponse({ type: RunSweepResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid body, or a delete without a reason (`REASON_REQUIRED`)' })
  @ApiUnauthorizedResponse({ description: 'No or invalid token' })
  @ApiForbiddenResponse({ description: 'Level too low — `admin` for a dry run, `super` to delete (`ADMIN_LEVEL_REQUIRED`)' })
  @ApiNotFoundResponse({ description: 'Unknown sweep kind' })
  @ApiConflictResponse({ description: 'A run of this kind is going (`SWEEP_RUNNING`)' })
  async run(
    @Param('kind') kind: string,
    @Body() body: RunSweepRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RunSweepResponseDto> {
    if (!isSweepKind(kind)) throw new NotFoundException(`Unknown sweep kind "${kind}"`);

    const result: Result<RunSweepResult, RunSweepError> = await this.commandBus.execute(
      // The guard has admitted only a token with a level.
      new RunSweepCommand(kind, body.dryRun, body.reason, { userId: user.userId, level: user.adminLevel! }),
    );
    if (result.isFail) throw toHttp(result.error);
    return result.value;
  }
}

function toHttp(error: RunSweepError): Error {
  switch (error.code) {
    case 'SWEEP_RUNNING':
      return new ConflictException({ message: 'SWEEP_RUNNING' });
    case 'ADMIN_LEVEL_REQUIRED':
      return new ForbiddenException({ message: 'ADMIN_LEVEL_REQUIRED', requiredLevel: error.requiredLevel });
    case 'REASON_REQUIRED':
      return new BadRequestException({ message: 'REASON_REQUIRED' });
  }
}
