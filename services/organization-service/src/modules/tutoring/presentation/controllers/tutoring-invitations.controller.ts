import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { ListPendingInvitationsQuery } from '../../application/queries/list-pending-invitations/list-pending-invitations.query.js';
import { SendTutoringInvitationRequestDto } from '../dto/send-invitation.request.dto.js';
import {
  SendTutoringInvitationResponseDto,
  PendingTutoringInvitationResponseDto,
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
  @ApiOperation({ summary: 'List pending invitations sent by the tutor' })
  @ApiResponse({ status: 200, type: [PendingTutoringInvitationResponseDto] })
  @ApiResponse({ status: 404, description: 'Tutoring group not found' })
  async listPendingInvitations(
    @CurrentUser() user: JwtPayload,
  ): Promise<PendingTutoringInvitationResponseDto[]> {
    const invitations: TutoringInvitation[] = await this.queryBus.execute(
      new ListPendingInvitationsQuery(user.sub),
    );
    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  @Post('group/invitations')
  @Roles('tutor')
  @ApiOperation({ summary: 'Send invitation to a student' })
  @ApiResponse({ status: 201, type: SendTutoringInvitationResponseDto })
  @ApiResponse({ status: 403, description: 'Requires tutor platform role' })
  @ApiResponse({ status: 404, description: 'Tutoring group not found' })
  async sendInvitation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendTutoringInvitationRequestDto,
  ): Promise<SendTutoringInvitationResponseDto> {
    return this.commandBus.execute(
      new SendTutoringInvitationCommand(user.sub, dto.email),
    );
  }

  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Accept a tutoring invitation by token' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Invitation expired, already used, or email mismatch' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async acceptInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new AcceptTutoringInvitationCommand(user.sub, user.email, token),
    );
  }
}
