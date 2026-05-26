import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
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
import { SendTutoringInvitationRequestDto } from '../dto/send-invitation.request.dto.js';
import { SendTutoringInvitationResponseDto } from '../dto/tutoring-group.response.dto.js';

@ApiTags('Tutoring')
@ApiBearerAuth('JWT')
@Controller('tutoring')
export class TutoringInvitationsController {
  constructor(private readonly commandBus: CommandBus) {}

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
