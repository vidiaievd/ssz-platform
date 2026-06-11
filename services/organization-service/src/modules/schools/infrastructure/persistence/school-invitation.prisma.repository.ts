import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ISchoolInvitationRepository,
  InvitationFilters,
} from '../../domain/repositories/school-invitation.repository.interface.js';
import type { SchoolInvitation } from '../../domain/entities/school-invitation.entity.js';
import type { MemberRole } from '../../domain/value-objects/member-role.vo.js';
import { SchoolInvitationMapper } from './school-invitation.mapper.js';

@Injectable()
export class SchoolInvitationPrismaRepository implements ISchoolInvitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<SchoolInvitation | null> {
    const raw = await (this.prisma as any).schoolInvitation.findUnique({ where: { id } });
    return raw ? SchoolInvitationMapper.toDomain(raw) : null;
  }

  async findByToken(token: string): Promise<SchoolInvitation | null> {
    const raw = await (this.prisma as any).schoolInvitation.findUnique({ where: { token } });
    return raw ? SchoolInvitationMapper.toDomain(raw) : null;
  }

  async findPendingBySchoolId(schoolId: string): Promise<SchoolInvitation[]> {
    const rows = await (this.prisma as any).schoolInvitation.findMany({
      where: { schoolId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolInvitationMapper.toDomain);
  }

  async findBySchoolId(schoolId: string, filters?: InvitationFilters): Promise<SchoolInvitation[]> {
    const where: Record<string, unknown> = { schoolId };

    if (filters?.role) {
      where['role'] = filters.role;
    }
    if (filters?.status) {
      where['status'] = filters.status;
    }
    if (filters?.search) {
      where['email'] = { contains: filters.search.toLowerCase(), mode: 'insensitive' };
    }

    const rows = await (this.prisma as any).schoolInvitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolInvitationMapper.toDomain);
  }

  async findActivePendingByEmailAndRole(
    schoolId: string,
    email: string,
    role: MemberRole,
  ): Promise<SchoolInvitation | null> {
    const raw = await (this.prisma as any).schoolInvitation.findFirst({
      where: {
        schoolId,
        email: { equals: email, mode: 'insensitive' },
        role,
        status: 'PENDING',
      },
    });
    return raw ? SchoolInvitationMapper.toDomain(raw) : null;
  }

  async save(invitation: SchoolInvitation): Promise<void> {
    await (this.prisma as any).schoolInvitation.upsert({
      where: { id: invitation.id },
      create: {
        id: invitation.id,
        schoolId: invitation.schoolId,
        email: invitation.email,
        role: invitation.role,
        kind: invitation.kind,
        targetGroupId: invitation.targetGroupId ?? null,
        invitedBy: invitation.invitedBy ?? null,
        token: invitation.token,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt ?? null,
        lastSentAt: invitation.lastSentAt,
        resendCount: invitation.resendCount,
        teacherMaxWeeklyHours: invitation.teacherMaxWeeklyHours ?? null,
        teacherEmploymentType: invitation.teacherEmploymentType ?? null,
        capabilities: invitation.capabilities,
        createdAt: invitation.createdAt,
        updatedAt: invitation.updatedAt,
      },
      update: {
        token: invitation.token,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt ?? null,
        lastSentAt: invitation.lastSentAt,
        resendCount: invitation.resendCount,
        updatedAt: invitation.updatedAt,
      },
    });
  }
}
