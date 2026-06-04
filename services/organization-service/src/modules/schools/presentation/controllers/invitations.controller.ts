import {
  Body,
  Controller,
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
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { SendInvitationCommand } from '../../application/commands/send-invitation/send-invitation.command.js';
import { AcceptInvitationCommand } from '../../application/commands/accept-invitation/accept-invitation.command.js';
import { ListSchoolInvitationsQuery } from '../../application/queries/list-school-invitations/list-school-invitations.query.js';
import { SendInvitationRequestDto } from '../dto/send-invitation.request.dto.js';
import { InvitationResponseDto, SendInvitationResponseDto } from '../dto/school.response.dto.js';
import type { SchoolInvitation } from '../../domain/entities/school-invitation.entity.js';

@ApiTags('Invitations')
@ApiBearerAuth('JWT')
@Controller('schools')
export class InvitationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':schoolId/invitations')
  @ApiOperation({ summary: 'List pending invitations for a school' })
  @ApiResponse({ status: 200, type: [InvitationResponseDto] })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async listInvitations(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<InvitationResponseDto[]> {
    const invitations: SchoolInvitation[] = await this.queryBus.execute(
      new ListSchoolInvitationsQuery(user.sub, schoolId),
    );
    return invitations.map((inv) => ({
      id: inv.id,
      schoolId: inv.schoolId,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    }));
  }

  @Post(':schoolId/invitations')
  @ApiOperation({ summary: 'Send an invitation to join the school' })
  @ApiResponse({ status: 201, type: SendInvitationResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async sendInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: SendInvitationRequestDto,
  ): Promise<SendInvitationResponseDto> {
    return this.commandBus.execute(
      new SendInvitationCommand(user.sub, schoolId, dto.email, dto.role, dto.kind ?? 'register', dto.targetGroupId),
    );
  }

  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Accept an invitation by token' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Invitation expired, already used, or email mismatch' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async acceptInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new AcceptInvitationCommand(user.sub, user.email, token),
    );
  }
}
