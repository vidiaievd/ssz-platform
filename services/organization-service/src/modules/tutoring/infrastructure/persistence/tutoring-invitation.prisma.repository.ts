import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ITutoringInvitationRepository } from '../../domain/repositories/tutoring-invitation.repository.interface.js';
import type { TutoringInvitation } from '../../domain/entities/tutoring-invitation.entity.js';
import { TutoringInvitationMapper } from './tutoring-invitation.mapper.js';

@Injectable()
export class TutoringInvitationPrismaRepository implements ITutoringInvitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TutoringInvitation | null> {
    const raw = await (this.prisma as any).tutoringInvitation.findUnique({ where: { id } });
    return raw ? TutoringInvitationMapper.toDomain(raw) : null;
  }

  async findByToken(token: string): Promise<TutoringInvitation | null> {
    const raw = await (this.prisma as any).tutoringInvitation.findUnique({ where: { token } });
    return raw ? TutoringInvitationMapper.toDomain(raw) : null;
  }

  async findPendingByGroupId(tutorGroupId: string): Promise<TutoringInvitation[]> {
    const rows = await (this.prisma as any).tutoringInvitation.findMany({
      where: { tutorGroupId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(TutoringInvitationMapper.toDomain);
  }

  async save(invitation: TutoringInvitation): Promise<void> {
    await (this.prisma as any).tutoringInvitation.upsert({
      where: { id: invitation.id },
      create: {
        id: invitation.id,
        tutorGroupId: invitation.tutorGroupId,
        email: invitation.email,
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
