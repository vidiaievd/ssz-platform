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
import { Public } from '../../../../common/decorators/public.decorator.js';
import { Roles } from '../../../../common/decorators/roles.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { SendInvitationCommand } from '../../../schools/application/commands/send-invitation/send-invitation.command.js';
import { ResendSchoolInvitationCommand } from '../../../schools/application/commands/resend-invitation/resend-invitation.command.js';
import { RevokeSchoolInvitationCommand } from '../../../schools/application/commands/revoke-invitation/revoke-invitation.command.js';
import { ProvisionSoloWorkspaceCommand } from '../../../schools/application/commands/provision-solo-workspace/provision-solo-workspace.command.js';
import { GetSoloWorkspaceQuery } from '../../../schools/application/queries/get-solo-workspace/get-solo-workspace.query.js';
import type { SoloWorkspaceResult } from '../../../schools/application/queries/get-solo-workspace/get-solo-workspace.handler.js';
import { ListSchoolInvitationsQuery } from '../../../schools/application/queries/list-school-invitations/list-school-invitations.query.js';
import { MemberRole } from '../../../schools/domain/value-objects/member-role.vo.js';
import type { SchoolInvitation } from '../../../schools/domain/entities/school-invitation.entity.js';
import { InvitationNotFoundException } from '../../../schools/domain/exceptions/invitation-not-found.exception.js';
import { AcceptTutoringInvitationCommand } from '../../application/commands/accept-invitation/accept-invitation.command.js';
import { ResendTutoringInvitationCommand } from '../../application/commands/resend-invitation/resend-tutoring-invitation.command.js';
import { RevokeTutoringInvitationCommand } from '../../application/commands/revoke-invitation/revoke-tutoring-invitation.command.js';
import { ListPendingInvitationsQuery } from '../../application/queries/list-pending-invitations/list-pending-invitations.query.js';
import { GetTutoringInvitationPreviewQuery } from '../../application/queries/get-invitation-preview/get-tutoring-invitation-preview.query.js';
import { SendTutoringInvitationRequestDto } from '../dto/send-invitation.request.dto.js';
import {
  SendTutoringInvitationResponseDto,
  TutoringInvitationPreviewResponseDto,
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
    // Two sources during the move: invitations the tutor sends now live in the
    // workspace, while the ones sent before still sit in tutoring_invitations and
    // must not vanish from the tutor's list (they are removed with the module in
    // phase 3).
    const workspace = await this.findWorkspace(user.sub);
    const fromWorkspace: SchoolInvitation[] = workspace
      ? await this.queryBus.execute(
          new ListSchoolInvitationsQuery(user.sub, workspace.schoolId, { role: MemberRole.STUDENT }),
        )
      : [];

    const legacy: TutoringInvitation[] = await this.queryBus.execute(
      new ListPendingInvitationsQuery(user.sub),
    );

    return [
      ...fromWorkspace.map((inv) => this.schoolInvitationToDto(inv)),
      ...legacy.map((inv) => this.toDto(inv)),
    ];
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
    const workspace = await this.requireWorkspace(user.sub);

    const result: { invitationId: string; token: string; expiresAt: string } =
      await this.commandBus.execute(
        new SendInvitationCommand(
          user.sub,
          workspace.schoolId,
          dto.email,
          MemberRole.STUDENT,
          'register',
          workspace.groupId,
        ),
      );

    return {
      invitationId: result.invitationId,
      token: result.token,
      expiresAt: result.expiresAt,
      deliveryStatus: 'queued',
    };
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
    const workspace = await this.findWorkspace(user.sub);
    if (workspace) {
      try {
        return await this.commandBus.execute(
          new ResendSchoolInvitationCommand(user.sub, workspace.schoolId, invitationId),
        );
      } catch (err) {
        // Not a workspace invitation — it predates the move, so the old table answers.
        if (!(err instanceof InvitationNotFoundException)) throw err;
      }
    }

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
    const workspace = await this.findWorkspace(user.sub);
    if (workspace) {
      try {
        await this.commandBus.execute(
          new RevokeSchoolInvitationCommand(user.sub, workspace.schoolId, invitationId),
        );
        return;
      } catch (err) {
        if (!(err instanceof InvitationNotFoundException)) throw err;
      }
    }

    await this.commandBus.execute(
      new RevokeTutoringInvitationCommand(user.sub, invitationId),
    );
  }

  @Get('invitations/:token')
  @Public()
  @ApiOperation({ summary: 'Preview tutoring invitation details by token — no authentication required (§5.6)' })
  @ApiResponse({ status: 200, type: TutoringInvitationPreviewResponseDto })
  @ApiResponse({ status: 404, description: 'Token not found or invalid signature' })
  async previewInvitation(
    @Param('token') token: string,
  ): Promise<TutoringInvitationPreviewResponseDto> {
    return this.queryBus.execute(new GetTutoringInvitationPreviewQuery(token));
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

  private findWorkspace(tutorId: string): Promise<SoloWorkspaceResult | null> {
    return this.queryBus.execute(new GetSoloWorkspaceQuery(tutorId));
  }

  /**
   * A tutor who registered before workspaces existed has none until something asks
   * for it — inviting a student is that something.
   */
  private async requireWorkspace(tutorId: string): Promise<SoloWorkspaceResult> {
    const existing = await this.findWorkspace(tutorId);
    if (existing?.groupId) return existing;

    await this.commandBus.execute(new ProvisionSoloWorkspaceCommand(tutorId));
    const provisioned = await this.findWorkspace(tutorId);
    if (!provisioned) {
      throw new Error(`Solo workspace could not be provisioned for tutor ${tutorId}`);
    }
    return provisioned;
  }

  private schoolInvitationToDto(inv: SchoolInvitation): TutoringInvitationResponseDto {
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
