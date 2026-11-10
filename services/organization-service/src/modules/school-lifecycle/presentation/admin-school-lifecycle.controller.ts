import { Body, Controller, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminLevel } from '@ssz/contracts';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequireAdminLevel } from '../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../common/guards/admin-level.guard.js';
import type { JwtPayload } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { ChangeSchoolStatusCommand } from '../application/commands/change-school-status.command.js';
import type { SchoolLifecycleState, SchoolTransition } from '../domain/school-lifecycle.js';
import { SchoolLifecycleDto, SchoolTransitionRequestDto } from './school-lifecycle.dto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Moves a school along its lifecycle (plan 90, phase 5). Levels per move are those of
 * `SCHOOL_TRANSITION_RULES`; a spec keeps the two in step.
 */
@ApiTags('Admin — schools')
@ApiBearerAuth('JWT')
@UseGuards(AdminLevelGuard)
@ApiUnauthorizedResponse({ description: 'No or invalid token' })
@ApiForbiddenResponse({ description: 'Not platform_admin, or the admin level is below the move’s (`ADMIN_LEVEL_REQUIRED`)' })
@ApiBadRequestResponse({ description: 'No reason, or longer than 500' })
@ApiNotFoundResponse({ description: 'No school with this id' })
@ApiConflictResponse({
  description: '`SCHOOL_TRANSITION_NOT_ALLOWED` — the school is not in a status this move starts from; `error.status` is where it stands',
})
@Controller('admin/schools')
export class AdminSchoolLifecycleController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post(':schoolId/suspend')
  @HttpCode(200)
  @RequireAdminLevel(AdminLevel.ADMIN)
  @ApiOperation({
    summary: 'Suspend a school: read only, closes by itself after SCHOOL_SUSPEND_DAYS (30)',
    description: '`active` → `suspended`. Level `admin`.',
  })
  @ApiOkResponse({ type: SchoolLifecycleDto })
  suspend(@Param('schoolId') id: string, @Body() body: SchoolTransitionRequestDto, @CurrentUser() user: JwtPayload) {
    return this.move(id, 'suspend', body.reason, user);
  }

  @Post(':schoolId/reactivate')
  @HttpCode(200)
  @RequireAdminLevel(AdminLevel.ADMIN)
  @ApiOperation({ summary: 'Lift a suspension', description: '`suspended` → `active`. Level `admin`.' })
  @ApiOkResponse({ type: SchoolLifecycleDto })
  reactivate(@Param('schoolId') id: string, @Body() body: SchoolTransitionRequestDto, @CurrentUser() user: JwtPayload) {
    return this.move(id, 'reactivate', body.reason, user);
  }

  @Post(':schoolId/close')
  @HttpCode(200)
  @RequireAdminLevel(AdminLevel.SUPER)
  @ApiOperation({
    summary: 'Close a school now: archive, purged after SCHOOL_ARCHIVE_DAYS (183)',
    description:
      '`active` / `suspended` → `closed`, skipping the 30 days. Staff lose their roles, learners keep their ' +
      'history; the subscription is canceled. Level `super`.',
  })
  @ApiOkResponse({ type: SchoolLifecycleDto })
  close(@Param('schoolId') id: string, @Body() body: SchoolTransitionRequestDto, @CurrentUser() user: JwtPayload) {
    return this.move(id, 'close', body.reason, user);
  }

  @Post(':schoolId/restore')
  @HttpCode(200)
  @RequireAdminLevel(AdminLevel.SUPER)
  @ApiOperation({
    summary: 'Bring a closed school back from the archive',
    description: '`closed` → `active`, an early purge not yet run included. The plan is not given back. Level `super`.',
  })
  @ApiOkResponse({ type: SchoolLifecycleDto })
  restore(@Param('schoolId') id: string, @Body() body: SchoolTransitionRequestDto, @CurrentUser() user: JwtPayload) {
    return this.move(id, 'restore', body.reason, user);
  }

  @Post(':schoolId/purge')
  @HttpCode(200)
  @RequireAdminLevel(AdminLevel.SUPER)
  @ApiOperation({
    summary: 'Purge a closed school early',
    description:
      'The school stays `closed` with `purgeAt` = now; the lifecycle timer purges it on its next run. A second ' +
      'request before that is a 409. Level `super`.',
  })
  @ApiOkResponse({ type: SchoolLifecycleDto })
  purge(@Param('schoolId') id: string, @Body() body: SchoolTransitionRequestDto, @CurrentUser() user: JwtPayload) {
    return this.move(id, 'purge', body.reason, user);
  }

  private async move(
    schoolId: string,
    transition: SchoolTransition,
    reason: string,
    user: JwtPayload,
  ): Promise<SchoolLifecycleDto> {
    if (!UUID.test(schoolId)) throw new NotFoundException('School not found');
    const state = await this.commandBus.execute<ChangeSchoolStatusCommand, SchoolLifecycleState>(
      new ChangeSchoolStatusCommand(
        schoolId,
        transition,
        // Past AdminLevelGuard the level is there.
        { kind: 'admin', userId: user.sub, level: user.adminLevel! },
        reason,
      ),
    );
    return {
      id: state.schoolId,
      status: state.status,
      statusChangedAt: state.statusChangedAt,
      statusReason: state.statusReason,
      closesAt: state.closesAt,
      purgeAt: state.purgeAt,
    };
  }
}
