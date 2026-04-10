import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ISchoolInvitationRepository } from '../../domain/repositories/school-invitation.repository.interface.js';
import type { SchoolInvitation } from '../../domain/entities/school-invitation.entity.js';
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

  async save(invitation: SchoolInvitation): Promise<void> {
    await (this.prisma as any).schoolInvitation.upsert({
      where: { id: invitation.id },
      create: {
        id: invitation.id,
        schoolId: invitation.schoolId,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        updatedAt: invitation.updatedAt,
      },
      update: {
        status: invitation.status,
        updatedAt: invitation.updatedAt,
      },
    });
  }
}
