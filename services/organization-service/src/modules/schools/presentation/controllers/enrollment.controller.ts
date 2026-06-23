import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { UpsertOnboardingSettingsCommand } from '../../application/commands/upsert-onboarding-settings/upsert-onboarding-settings.command.js';
import { CreateMembershipCommand } from '../../application/commands/create-membership/create-membership.command.js';
import { ApproveMembershipCommand } from '../../application/commands/approve-membership/approve-membership.command.js';
import { RejectMembershipCommand } from '../../application/commands/reject-membership/reject-membership.command.js';
import { SetMembershipAvailabilityCommand } from '../../application/commands/set-membership-availability/set-membership-availability.command.js';
import { SetMembershipAgeBandCommand } from '../../application/commands/set-membership-age-band/set-membership-age-band.command.js';
import { AssignMembershipGroupCommand } from '../../application/commands/assign-membership-group/assign-membership-group.command.js';
import { CompleteMembershipOnboardingCommand } from '../../application/commands/complete-membership-onboarding/complete-membership-onboarding.command.js';
import { GetOnboardingSettingsQuery } from '../../application/queries/get-onboarding-settings/get-onboarding-settings.query.js';
import { ListMembershipsQuery } from '../../application/queries/list-memberships/list-memberships.query.js';
import { GetMyMembershipQuery } from '../../application/queries/get-my-membership/get-my-membership.query.js';
import { MembershipNotFoundException } from '../../domain/exceptions/membership-not-found.exception.js';
import type { MembershipStatus } from '../../domain/entities/school-membership.entity.js';
import type { SchoolMembership } from '../../domain/entities/school-membership.entity.js';
import type { SchoolOnboardingSettings } from '../../domain/entities/school-onboarding-settings.entity.js';
import {
  AssignGroupRequestDto,
  CompleteMembershipOnboardingRequestDto,
  CreateMembershipRequestDto,
  SetAgeBandRequestDto,
  SetAvailabilityRequestDto,
  UpsertOnboardingSettingsRequestDto,
} from '../dto/enrollment.request.dto.js';
import {
  MembershipListResponseDto,
  MembershipResponseDto,
  OnboardingSettingsResponseDto,
} from '../dto/enrollment.response.dto.js';

function toMembershipResponse(m: SchoolMembership): MembershipResponseDto {
  return {
    id: m.id,
    schoolId: m.schoolId,
    studentId: m.studentId,
    status: m.status,
    source: m.source,
    language: m.language,
    availability: m.availability,
    ageBand: m.ageBand,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function toSettingsResponse(s: SchoolOnboardingSettings): OnboardingSettingsResponseDto {
  return {
    placementMode: s.placementMode,
    schoolTestId: s.schoolTestId,
    reusePlatform: s.reusePlatform,
    maxResultAgeDays: s.maxResultAgeDays,
    interviewRequired: s.interviewRequired,
    autoPlaceByScore: s.autoPlaceByScore,
    collectAvailability: s.collectAvailability,
    ageBands: s.ageBands,
    collectAgeBand: s.collectAgeBand,
    approvalMode: s.approvalMode,
  };
}

@ApiTags('Enrollment')
@ApiBearerAuth('JWT')
@Controller('schools')
export class EnrollmentController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ── E.2 — Onboarding settings ─────────────────────────────────────────────

  @Get(':schoolId/enrollment/settings')
  @ApiOperation({ summary: 'Get school onboarding settings (OWNER/ADMIN)' })
  @ApiResponse({ status: 200, type: OnboardingSettingsResponseDto })
  async getOnboardingSettings(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<OnboardingSettingsResponseDto> {
    const settings = await this.queryBus.execute(new GetOnboardingSettingsQuery(user.sub, schoolId));
    return toSettingsResponse(settings);
  }

  @Put(':schoolId/enrollment/settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert school onboarding settings (OWNER/ADMIN)' })
  @ApiResponse({ status: 200, type: OnboardingSettingsResponseDto })
  async upsertOnboardingSettings(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: UpsertOnboardingSettingsRequestDto,
  ): Promise<OnboardingSettingsResponseDto> {
    await this.commandBus.execute(
      new UpsertOnboardingSettingsCommand(
        user.sub,
        schoolId,
        dto.placementMode,
        dto.schoolTestId,
        dto.reusePlatform,
        dto.maxResultAgeDays,
        dto.interviewRequired,
        dto.autoPlaceByScore,
        dto.collectAvailability,
        dto.ageBands,
        dto.collectAgeBand,
        dto.approvalMode,
      ),
    );
    const settings = await this.queryBus.execute(new GetOnboardingSettingsQuery(user.sub, schoolId));
    return toSettingsResponse(settings);
  }

  // ── E.3 — Memberships ─────────────────────────────────────────────────────

  @Post(':schoolId/memberships')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply to join a school (student) — creates membership in pending|onboarding status' })
  @ApiResponse({ status: 201, type: MembershipResponseDto })
  async createMembership(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateMembershipRequestDto,
  ): Promise<MembershipResponseDto> {
    const membership = await this.commandBus.execute(
      new CreateMembershipCommand(user.sub, schoolId, dto.source, dto.language),
    );
    return toMembershipResponse(membership);
  }

  @Get(':schoolId/memberships')
  @ApiOperation({ summary: 'List school memberships (OWNER/ADMIN/MANAGER — admin view)' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'onboarding', 'placement-review', 'active', 'rejected', 'left'] })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiResponse({ status: 200, type: MembershipListResponseDto })
  async listMemberships(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
  ): Promise<MembershipListResponseDto> {
    const result = await this.queryBus.execute(
      new ListMembershipsQuery(user.sub, schoolId, status as MembershipStatus | undefined, search, cursor),
    );
    return { items: result.items.map(toMembershipResponse), nextCursor: result.nextCursor };
  }

  @Get(':schoolId/memberships/me')
  @ApiOperation({ summary: "Get the calling student's membership in this school" })
  @ApiResponse({ status: 200, type: MembershipResponseDto })
  @ApiResponse({ status: 404, description: 'No membership found' })
  async getMyMembership(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<MembershipResponseDto> {
    try {
      const m = await this.queryBus.execute(new GetMyMembershipQuery(user.sub, schoolId));
      return toMembershipResponse(m);
    } catch (err) {
      if (err instanceof MembershipNotFoundException) throw new NotFoundException(err.message);
      throw err;
    }
  }

  @Post(':schoolId/memberships/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Approve a pending membership → onboarding (OWNER/ADMIN)' })
  @ApiResponse({ status: 204 })
  async approveMembership(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.commandBus.execute(new ApproveMembershipCommand(user.sub, schoolId, id));
  }

  @Post(':schoolId/memberships/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reject a pending membership (OWNER/ADMIN)' })
  @ApiResponse({ status: 204 })
  async rejectMembership(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.commandBus.execute(new RejectMembershipCommand(user.sub, schoolId, id));
  }

  @Post(':schoolId/memberships/:id/availability')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Student sets their availability during onboarding' })
  @ApiResponse({ status: 204 })
  async setAvailability(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAvailabilityRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new SetMembershipAvailabilityCommand(user.sub, schoolId, id, dto.prefs),
    );
  }

  @Post(':schoolId/memberships/:id/age-band')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Student sets their age band during onboarding' })
  @ApiResponse({ status: 204 })
  async setAgeBand(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAgeBandRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new SetMembershipAgeBandCommand(user.sub, schoolId, id, dto.ageBand),
    );
  }

  @Post(':schoolId/memberships/:id/assign-group')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin assigns a student to a group → transitions membership to active (OWNER/ADMIN)' })
  @ApiResponse({ status: 204 })
  async assignGroup(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignGroupRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AssignMembershipGroupCommand(user.sub, schoolId, id, dto.groupId),
    );
  }

  @Post(':schoolId/memberships/:id/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Student completes onboarding → transitions membership to active or placement-review' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Caller is not the membership owner' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  @ApiResponse({ status: 409, description: 'Invalid transition from current status' })
  async completeMembershipOnboarding(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteMembershipOnboardingRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new CompleteMembershipOnboardingCommand(user.sub, schoolId, id, dto.to),
    );
  }
}
