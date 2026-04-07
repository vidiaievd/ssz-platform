import { Injectable } from '@nestjs/common';
import { Prisma, Profile, ProfileType } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<Profile | null> {
    return this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
    });
  }

  async findById(id: string): Promise<Profile | null> {
    return this.prisma.profile.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async create(data: Prisma.ProfileCreateInput): Promise<Profile> {
    return this.prisma.profile.create({ data });
  }

  async update(id: string, data: Prisma.ProfileUpdateInput): Promise<Profile> {
    return this.prisma.profile.update({ where: { id }, data });
  }

  // Soft-delete: set deletedAt instead of removing the record
  async softDelete(userId: string): Promise<void> {
    await this.prisma.profile.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async existsByUserId(userId: string): Promise<boolean> {
    const count = await this.prisma.profile.count({
      where: { userId, deletedAt: null },
    });
    return count > 0;
  }

  async findPublicProfile(userId: string): Promise<Profile | null> {
    return this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
    });
  }
}
