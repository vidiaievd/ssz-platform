import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  IProgressRepository,
  FindByUserOptions,
} from '../../domain/repositories/progress.repository.interface.js';
import { UserProgress } from '../../domain/entities/user-progress.entity.js';
import { ProgressMapper } from './progress.mapper.js';
import type { ContentRef } from '../../../../shared/domain/value-objects/content-ref.js';

@Injectable()
export class PrismaProgressRepository implements IProgressRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserProgress | null> {
    const row = await this.prisma.userProgress.findUnique({ where: { id } });
    return row ? ProgressMapper.toDomain(row) : null;
  }

  async findByUserAndContent(
    userId: string,
    contentType: string,
    contentId: string,
  ): Promise<UserProgress | null> {
    const row = await this.prisma.userProgress.findUnique({
      where: { userId_contentType_contentId: { userId, contentType: contentType as any, contentId } },
    });
    return row ? ProgressMapper.toDomain(row) : null;
  }

  async findByUser(userId: string, options: FindByUserOptions = {}): Promise<UserProgress[]> {
    const rows = await this.prisma.userProgress.findMany({
      where: {
        userId,
        ...(options.contentType ? { contentType: options.contentType as any } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      skip: options.offset,
      take: options.limit,
    });
    return rows.map(ProgressMapper.toDomain);
  }

  async findCompletedCountForUser(userId: string, refs: ContentRef[]): Promise<number> {
    if (refs.length === 0) return 0;
    return this.prisma.userProgress.count({
      where: {
        userId,
        status: 'COMPLETED',
        OR: refs.map((r) => ({ contentType: r.type as any, contentId: r.id })),
      },
    });
  }

  async save(progress: UserProgress): Promise<void> {
    const data = ProgressMapper.toPersistence(progress);
    await this.prisma.userProgress.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
