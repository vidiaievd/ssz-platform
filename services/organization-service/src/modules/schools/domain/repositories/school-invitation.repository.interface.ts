import type { SchoolInvitation } from '../entities/school-invitation.entity.js';
import type { InvitationStatus } from '../value-objects/invitation-status.vo.js';
import type { MemberRole } from '../value-objects/member-role.vo.js';

export interface InvitationFilters {
  role?: MemberRole;
  status?: InvitationStatus;
  search?: string;
}

export interface ISchoolInvitationRepository {
  findById(id: string): Promise<SchoolInvitation | null>;
  findByToken(token: string): Promise<SchoolInvitation | null>;
  findPendingBySchoolId(schoolId: string): Promise<SchoolInvitation[]>;
  findBySchoolId(schoolId: string, filters?: InvitationFilters): Promise<SchoolInvitation[]>;
  findActivePendingByEmailAndRole(schoolId: string, email: string, role: MemberRole): Promise<SchoolInvitation | null>;
  save(invitation: SchoolInvitation): Promise<void>;
}

export const SCHOOL_INVITATION_REPOSITORY = Symbol('SCHOOL_INVITATION_REPOSITORY');
