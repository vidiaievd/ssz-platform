import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Profile } from '../../domain/entities/profile.entity.js';
import { IProfileRepository } from '../../domain/repositories/profile.repository.interface.js';
import { ProfileMapper } from './profile.mapper.js';

@Injectable()
export class ProfilePrismaRepository implements IProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Profile | null> {
    const raw = await (this.prisma as any).profile.findFirst({
      where: { id, deletedAt: null },
    });
    return raw ? ProfileMapper.toDomain(raw) : null;
  }

  async findByUserId(userId: string): Promise<Profile | null> {
    const raw = await (this.prisma as any).profile.findFirst({
      where: { userId, deletedAt: null },
    });
    return raw ? ProfileMapper.toDomain(raw) : null;
  }

  async save(profile: Profile): Promise<void> {
    const data = ProfileMapper.toPersistence(profile);
    await (this.prisma as any).profile.upsert({
      where: { id: data.id },
      create: data,
      update: {
        displayName: data.displayName,
        firstName: data.firstName,
        lastName: data.lastName,
        avatarUrl: data.avatarUrl,
        bio: data.bio,
        timezone: data.timezone,
        locale: data.locale,
        deletedAt: data.deletedAt,
      },
    });
  }

  async softDelete(id: string): Promise<void> {
    await (this.prisma as any).profile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
