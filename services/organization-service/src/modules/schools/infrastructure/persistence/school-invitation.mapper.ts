import type { InvitationKind, EmploymentType } from '../../domain/entities/school-invitation.entity.js';
import { SchoolInvitation } from '../../domain/entities/school-invitation.entity.js';

type PrismaSchoolInvitation = {
  id: string;
  schoolId: string;
  email: string;
  role: string;
  kind: string;
  targetGroupId: string | null;
  invitedBy: string | null;
  token: string;
  status: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  lastSentAt: Date;
  resendCount: number;
  teacherMaxWeeklyHours: number | null;
  teacherEmploymentType: string | null;
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
      invitedBy: raw.invitedBy,
      token: raw.token,
      status: raw.status as any,
      expiresAt: raw.expiresAt,
      acceptedAt: raw.acceptedAt,
      lastSentAt: raw.lastSentAt,
      resendCount: raw.resendCount,
      teacherMaxWeeklyHours: raw.teacherMaxWeeklyHours,
      teacherEmploymentType: raw.teacherEmploymentType as EmploymentType | null,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
