import type { SchoolInvitation } from '../entities/school-invitation.entity.js';

export interface ISchoolInvitationRepository {
  findById(id: string): Promise<SchoolInvitation | null>;
  findByToken(token: string): Promise<SchoolInvitation | null>;
  findPendingBySchoolId(schoolId: string): Promise<SchoolInvitation[]>;
  save(invitation: SchoolInvitation): Promise<void>;
}

export const SCHOOL_INVITATION_REPOSITORY = Symbol('SCHOOL_INVITATION_REPOSITORY');
