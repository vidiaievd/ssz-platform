import { TutoringInvitation } from '../../domain/entities/tutoring-invitation.entity.js';

type PrismaTutoringInvitation = {
  id: string;
  tutorGroupId: string;
  email: string;
  token: string;
  status: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  lastSentAt: Date;
  resendCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export class TutoringInvitationMapper {
  static toDomain(raw: PrismaTutoringInvitation): TutoringInvitation {
    return TutoringInvitation.rehydrate({
      id: raw.id,
      tutorGroupId: raw.tutorGroupId,
      email: raw.email,
      token: raw.token,
      status: raw.status as any,
      expiresAt: raw.expiresAt,
      acceptedAt: raw.acceptedAt,
      lastSentAt: raw.lastSentAt,
      resendCount: raw.resendCount,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
