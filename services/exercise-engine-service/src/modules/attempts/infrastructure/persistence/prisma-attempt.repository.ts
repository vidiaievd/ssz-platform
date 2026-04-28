import { Injectable } from '@nestjs/common';
import type { IAttemptRepository } from '../../domain/repositories/attempt.repository.js';
import { Attempt } from '../../domain/entities/attempt.entity.js';
import { AttemptMapper } from './attempt.mapper.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

@Injectable()
export class PrismaAttemptRepository implements IAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Attempt | null> {
    const row = await this.prisma.attempt.findUnique({ where: { id } });
    return row ? AttemptMapper.toDomain(row) : null;
  }

  async findInProgress(userId: string, exerciseId: string): Promise<Attempt | null> {
    const row = await this.prisma.attempt.findFirst({
      where: { userId, exerciseId, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
    });
    return row ? AttemptMapper.toDomain(row) : null;
  }

  async save(attempt: Attempt): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = AttemptMapper.toPersistence(attempt) as any;
    await this.prisma.attempt.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
