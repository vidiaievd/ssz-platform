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
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { Roles } from '../../../../common/decorators/roles.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { SendTutoringInvitationCommand } from '../../application/commands/send-invitation/send-invitation.command.js';
import { AcceptTutoringInvitationCommand } from '../../application/commands/accept-invitation/accept-invitation.command.js';
import { ResendTutoringInvitationCommand } from '../../application/commands/resend-invitation/resend-tutoring-invitation.command.js';
import { RevokeTutoringInvitationCommand } from '../../application/commands/revoke-invitation/revoke-tutoring-invitation.command.js';
import { ListPendingInvitationsQuery } from '../../application/queries/list-pending-invitations/list-pending-invitations.query.js';
import { SendTutoringInvitationRequestDto } from '../dto/send-invitation.request.dto.js';
import {
  SendTutoringInvitationResponseDto,
  TutoringInvitationResponseDto,
  ResendTutoringInvitationResponseDto,
} from '../dto/tutoring-group.response.dto.js';
import type { TutoringInvitation } from '../../domain/entities/tutoring-invitation.entity.js';

@ApiTags('Tutoring')
@ApiBearerAuth('JWT')
@Controller('tutoring')
export class TutoringInvitationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('group/invitations')
  @Roles('tutor')
  @ApiOperation({ summary: 'List all invitations sent by the tutor (all statuses)' })
  @ApiResponse({ status: 200, type: [TutoringInvitationResponseDto] })
  @ApiResponse({ status: 404, description: 'Tutoring group not found' })
  async listInvitations(
    @CurrentUser() user: JwtPayload,
  ): Promise<TutoringInvitationResponseDto[]> {
    const invitations: TutoringInvitation[] = await this.queryBus.execute(
      new ListPendingInvitationsQuery(user.sub),
    );
    return invitations.map((inv) => this.toDto(inv));
  }

  @Post('group/invitations')
  @Roles('tutor')
  @ApiOperation({ summary: 'Send invitation to a student' })
  @ApiResponse({ status: 201, type: SendTutoringInvitationResponseDto })
  @ApiResponse({ status: 403, description: 'Requires tutor platform role or pending invite exists' })
  @ApiResponse({ status: 404, description: 'Tutoring group not found' })
  async sendInvitation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendTutoringInvitationRequestDto,
  ): Promise<SendTutoringInvitationResponseDto> {
    return this.commandBus.execute(
      new SendTutoringInvitationCommand(user.sub, dto.email),
    );
  }

  @Post('group/invitations/:invitationId/resend')
  @Roles('tutor')
  @ApiOperation({ summary: 'Resend a tutoring invitation — rotates token and re-queues email' })
  @ApiResponse({ status: 200, type: ResendTutoringInvitationResponseDto })
  @ApiResponse({ status: 409, description: 'Invitation already accepted' })
  @ApiResponse({ status: 410, description: 'Invitation revoked' })
  @ApiResponse({ status: 429, description: 'Resend throttled' })
  async resendInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<ResendTutoringInvitationResponseDto> {
    return this.commandBus.execute(
      new ResendTutoringInvitationCommand(user.sub, invitationId),
    );
  }

  @Delete('group/invitations/:invitationId')
  @Roles('tutor')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a tutoring invitation' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Invitation already accepted' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async revokeInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new RevokeTutoringInvitationCommand(user.sub, invitationId),
    );
  }

  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Accept a tutoring invitation by token' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Token invalid or email mismatch' })
  @ApiResponse({ status: 410, description: 'Invitation expired or revoked' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async acceptInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new AcceptTutoringInvitationCommand(user.sub, user.email, token),
    );
  }

  private toDto(inv: TutoringInvitation): TutoringInvitationResponseDto {
    return {
      invitationId: inv.id,
      email: inv.email,
      status: inv.status,
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
      lastSentAt: inv.lastSentAt.toISOString(),
      resendCount: inv.resendCount,
    };
  }
}
