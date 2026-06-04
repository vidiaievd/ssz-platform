import type { InvitationKind } from '../../domain/entities/school-invitation.entity.js';
import { SchoolInvitation } from '../../domain/entities/school-invitation.entity.js';

type PrismaSchoolInvitation = {
  id: string;
  schoolId: string;
  email: string;
  role: string;
  kind: string;
  targetGroupId: string | null;
  token: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export class SchoolInvitationMapper {
  static toDomain(raw: PrismaSchoolInvitation): SchoolInvitation {
    return SchoolInvitation.rehydrate({
      id: raw.id,
      schoolId: raw.schoolId,
      email: raw.email,
      role: raw.role as any,
      kind: raw.kind as InvitationKind,
      targetGroupId: raw.targetGroupId,
      token: raw.token,
      status: raw.status as any,
      expiresAt: raw.expiresAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
