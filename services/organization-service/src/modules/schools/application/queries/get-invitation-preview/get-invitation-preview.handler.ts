import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetSchoolInvitationPreviewQuery } from './get-invitation-preview.query.js';
import {
  SCHOOL_INVITATION_REPOSITORY,
  type ISchoolInvitationRepository,
} from '../../../domain/repositories/school-invitation.repository.interface.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { InvitationTokenService } from '../../../infrastructure/invitation-token.service.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';

export interface InvitationPreviewResult {
  schoolName: string;
  schoolSlug: string;
  role: string;
  kind: string;
  email: string;
  invitedByName: string | null;
  status: string;
  expiresAt: string;
}

@QueryHandler(GetSchoolInvitationPreviewQuery)
export class GetSchoolInvitationPreviewHandler implements IQueryHandler<GetSchoolInvitationPreviewQuery> {
  constructor(
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
    @Inject(SCHOOL_REPOSITORY)
    private readonly schoolRepository: ISchoolRepository,
    private readonly tokenService: InvitationTokenService,
  ) {}

  async execute(query: GetSchoolInvitationPreviewQuery): Promise<InvitationPreviewResult> {
    // Verify signature and extract claims — 404 if invalid/tampered.
    let decoded: ReturnType<InvitationTokenService['verify']>;
    try {
      decoded = this.tokenService.verify(query.token);
    } catch {
      throw new InvitationNotFoundException(query.token);
    }

    const invitation = await this.invitationRepository.findByToken(query.token);
    if (!invitation) throw new InvitationNotFoundException(query.token);

    // Derive computed status respecting expiry.
    let status = invitation.status as string;
    if (status === 'PENDING' && invitation.isExpired()) {
      status = 'expired';
    } else {
      status = status.toLowerCase();
    }

    // expired or revoked → 410 handled by controller via status field; we always return 200
    // with the status so the frontend can show the right UI.

    const school = await this.schoolRepository.findById(invitation.schoolId);
    if (!school) throw new InvitationNotFoundException(query.token);

    return {
      schoolName: school.name,
      schoolSlug: school.slug,
      role: invitation.role,
      kind: invitation.kind,
      email: decoded.email,
      invitedByName: null,
      status,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }
}
