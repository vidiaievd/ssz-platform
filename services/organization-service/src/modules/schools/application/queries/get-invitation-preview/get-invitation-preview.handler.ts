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
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';
import {
  PROFILE_SERVICE_PORT,
  type IProfileServicePort,
} from '../../../../../shared/application/ports/profile-service.interface.js';

export interface InvitationPreviewResult {
  /** Null for an invitation into a solo tutor workspace — there is no school to name. */
  schoolName: string | null;
  schoolSlug: string | null;
  role: string;
  kind: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  invitedByName: string | null;
  status: string;
  expiresAt: string;
  teachingLanguages: Array<{ code: string; level: string | null }> | null;
}

@QueryHandler(GetSchoolInvitationPreviewQuery)
export class GetSchoolInvitationPreviewHandler implements IQueryHandler<GetSchoolInvitationPreviewQuery> {
  constructor(
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
    @Inject(SCHOOL_REPOSITORY)
    private readonly schoolRepository: ISchoolRepository,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
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

    // A solo workspace names nobody but the tutor: the page behind this link is
    // the same page a school invitation opens, and it reads these two fields to
    // decide which contour to draw (see InviteCard).
    const invitedByName = school.isSolo
      ? (await this.profileService.getProfileSummary(school.ownerId))?.name ?? null
      : null;

    return {
      schoolName: school.isSolo ? null : school.name,
      schoolSlug: school.isSolo ? null : school.slug,
      role: invitation.role,
      kind: invitation.kind,
      email: decoded.email,
      firstName: invitation.firstName ?? null,
      lastName: invitation.lastName ?? null,
      invitedByName,
      status,
      expiresAt: invitation.expiresAt.toISOString(),
      teachingLanguages: invitation.teacherLanguages?.map((l) => ({ code: l.code, level: l.level ?? null })) ?? null,
    };
  }
}
