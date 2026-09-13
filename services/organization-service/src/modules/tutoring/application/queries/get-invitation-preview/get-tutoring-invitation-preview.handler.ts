import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetTutoringInvitationPreviewQuery } from './get-tutoring-invitation-preview.query.js';
import {
  TUTORING_INVITATION_REPOSITORY,
  type ITutoringInvitationRepository,
} from '../../../domain/repositories/tutoring-invitation.repository.interface.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import {
  PROFILE_SERVICE_PORT,
  type IProfileServicePort,
} from '../../../../../shared/application/ports/profile-service.interface.js';
import { TutoringInvitationTokenService } from '../../../infrastructure/tutoring-invitation-token.service.js';
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';

export interface TutoringInvitationPreviewResult {
  role: 'STUDENT';
  kind: 'register';
  email: string;
  invitedByName: string | null;
  status: string;
  expiresAt: string;
}

@QueryHandler(GetTutoringInvitationPreviewQuery)
export class GetTutoringInvitationPreviewHandler implements IQueryHandler<GetTutoringInvitationPreviewQuery> {
  constructor(
    @Inject(TUTORING_INVITATION_REPOSITORY)
    private readonly invitationRepository: ITutoringInvitationRepository,
    @Inject(TUTORING_GROUP_REPOSITORY)
    private readonly groupRepository: ITutoringGroupRepository,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
    private readonly tokenService: TutoringInvitationTokenService,
  ) {}

  async execute(query: GetTutoringInvitationPreviewQuery): Promise<TutoringInvitationPreviewResult> {
    let decoded: ReturnType<TutoringInvitationTokenService['verify']>;
    try {
      decoded = this.tokenService.verify(query.token);
    } catch {
      throw new InvitationNotFoundException(query.token);
    }

    const invitation = await this.invitationRepository.findByToken(query.token);
    if (!invitation) throw new InvitationNotFoundException(query.token);

    let status = invitation.status as string;
    if (status === 'PENDING' && invitation.isExpired()) {
      status = 'expired';
    } else {
      status = status.toLowerCase();
    }

    // The invitee sees who invited them — a tutoring invitation names no school,
    // so the tutor's display name is the only thing identifying the sender.
    const group = await this.groupRepository.findById(decoded.tutorGroupId);
    const tutorProfile = group ? await this.profileService.getProfileSummary(group.tutorId) : null;

    return {
      role: 'STUDENT',
      kind: 'register',
      email: decoded.email,
      invitedByName: tutorProfile?.name ?? null,
      status,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }
}
