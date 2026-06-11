import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { SendInvitationCommand } from '../../application/commands/send-invitation/send-invitation.command.js';
import { AcceptInvitationCommand } from '../../application/commands/accept-invitation/accept-invitation.command.js';
import { ResendSchoolInvitationCommand } from '../../application/commands/resend-invitation/resend-invitation.command.js';
import { RevokeSchoolInvitationCommand } from '../../application/commands/revoke-invitation/revoke-invitation.command.js';
import { ListSchoolInvitationsQuery } from '../../application/queries/list-school-invitations/list-school-invitations.query.js';
import { GetSchoolInvitationPreviewQuery } from '../../application/queries/get-invitation-preview/get-invitation-preview.query.js';
import { SendInvitationRequestDto } from '../dto/send-invitation.request.dto.js';
import {
  InvitationPreviewResponseDto,
  InvitationResponseDto,
  ResendInvitationResponseDto,
  SendInvitationResponseDto,
} from '../dto/school.response.dto.js';
import type { SchoolInvitation } from '../../domain/entities/school-invitation.entity.js';
import type { MemberRole } from '../../domain/value-objects/member-role.vo.js';
import type { InvitationStatus } from '../../domain/value-objects/invitation-status.vo.js';

@ApiTags('Invitations')
@ApiBearerAuth('JWT')
@Controller('schools')
export class InvitationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':schoolId/invitations')
  @ApiOperation({ summary: 'List all invitations for a school (owner/admin see all; teacher sees only STUDENT invitations)' })
  @ApiQuery({ name: 'role', required: false, description: 'Filter by role' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (pending|accepted|expired|revoked)' })
  @ApiQuery({ name: 'search', required: false, description: 'Filter by email (partial match)' })
  @ApiResponse({ status: 200, type: [InvitationResponseDto] })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async listInvitations(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<InvitationResponseDto[]> {
    const normalizedRole = role?.toUpperCase() as MemberRole | undefined;
    const normalizedStatus = status?.toUpperCase() as InvitationStatus | undefined;
    const invitations: SchoolInvitation[] = await this.queryBus.execute(
      new ListSchoolInvitationsQuery(user.sub, schoolId, { role: normalizedRole, status: normalizedStatus, search }),
    );
    return invitations.map((inv) => this.toDto(inv));
  }

  @Post(':schoolId/invitations')
  @ApiOperation({ summary: 'Send an invitation to join the school' })
  @ApiResponse({ status: 201, type: SendInvitationResponseDto })
  @ApiResponse({ status: 409, description: 'Pending invitation for this email+role already exists' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async sendInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: SendInvitationRequestDto,
  ): Promise<SendInvitationResponseDto> {
    return this.commandBus.execute(
      new SendInvitationCommand(
        user.sub, schoolId, dto.email, dto.role,
        dto.kind ?? 'register', dto.targetGroupId,
        dto.maxWeeklyHours ?? null,
        dto.employmentType ?? null,
      ),
    );
  }

  @Post(':schoolId/invitations/:invitationId/resend')
  @ApiOperation({ summary: 'Resend an invitation — rotates the token and re-queues the email' })
  @ApiResponse({ status: 200, type: ResendInvitationResponseDto })
  @ApiResponse({ status: 409, description: 'Invitation already accepted' })
  @ApiResponse({ status: 410, description: 'Invitation revoked' })
  @ApiResponse({ status: 429, description: 'Resend throttled' })
  async resendInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<ResendInvitationResponseDto> {
    return this.commandBus.execute(
      new ResendSchoolInvitationCommand(user.sub, schoolId, invitationId),
    );
  }

  @Delete(':schoolId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an invitation — invalidates the token' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Invitation already accepted' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async revokeInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new RevokeSchoolInvitationCommand(user.sub, schoolId, invitationId),
    );
  }

  @Get('invitations/:token')
  @Public()
  @ApiOperation({ summary: 'Preview invitation details by token — no authentication required (§5.6)' })
  @ApiResponse({ status: 200, type: InvitationPreviewResponseDto })
  @ApiResponse({ status: 404, description: 'Token not found or invalid signature' })
  async previewInvitation(
    @Param('token') token: string,
  ): Promise<InvitationPreviewResponseDto> {
    return this.queryBus.execute(new GetSchoolInvitationPreviewQuery(token));
  }

  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Accept an invitation by token' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Token invalid or email mismatch' })
  @ApiResponse({ status: 410, description: 'Invitation expired or revoked' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async acceptInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new AcceptInvitationCommand(user.sub, user.email, token),
    );
  }

  private toDto(inv: SchoolInvitation): InvitationResponseDto {
    return {
      invitationId: inv.id,
      email: inv.email,
      role: inv.role,
      kind: inv.kind,
      status: inv.status,
      targetGroupId: inv.targetGroupId ?? null,
      targetGroupName: null,
      invitedByName: null,
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
      lastSentAt: inv.lastSentAt.toISOString(),
      resendCount: inv.resendCount,
    };
  }
}
