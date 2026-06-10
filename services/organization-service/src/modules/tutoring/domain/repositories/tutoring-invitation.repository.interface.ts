import type { TutoringInvitation } from '../entities/tutoring-invitation.entity.js';

export interface ITutoringInvitationRepository {
  findById(id: string): Promise<TutoringInvitation | null>;
  findByToken(token: string): Promise<TutoringInvitation | null>;
  findPendingByGroupId(tutorGroupId: string): Promise<TutoringInvitation[]>;
  findAllByGroupId(tutorGroupId: string): Promise<TutoringInvitation[]>;
  findActivePendingByEmail(tutorGroupId: string, email: string): Promise<TutoringInvitation | null>;
  save(invitation: TutoringInvitation): Promise<void>;
}

export const TUTORING_INVITATION_REPOSITORY = Symbol('TUTORING_INVITATION_REPOSITORY');
