import { Injectable } from '@nestjs/common';
import type { IAttemptRepository, FindUserAttemptsFilter, FindByUserCursorFilter } from '../../domain/repositories/attempt.repository.js';
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

  async findAllInProgressByExercise(exerciseId: string): Promise<Attempt[]> {
    const rows = await this.prisma.attempt.findMany({
      where: { exerciseId, status: 'IN_PROGRESS' },
    });
    return rows.map(AttemptMapper.toDomain);
  }

  async findAllByUser(
    userId: string,
    filter: FindUserAttemptsFilter,
  ): Promise<{ items: Attempt[]; total: number }> {
    const where = {
      userId,
      ...(filter.exerciseId ? { exerciseId: filter.exerciseId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.attempt.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: filter.offset,
        take: filter.limit,
      }),
      this.prisma.attempt.count({ where }),
    ]);

    return { items: rows.map(AttemptMapper.toDomain), total };
  }

  async findByUserWithCursor(
    userId: string,
    filter: FindByUserCursorFilter,
  ): Promise<{ items: Attempt[]; hasMore: boolean }> {
    const cursorWhere = filter.cursor
      ? {
          OR: [
            { startedAt: { lt: filter.cursor.startedAt } },
            { startedAt: filter.cursor.startedAt, id: { lt: filter.cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.attempt.findMany({
      where: {
        userId,
        ...(filter.exerciseId ? { exerciseId: filter.exerciseId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...cursorWhere,
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    });

    const hasMore = rows.length > filter.limit;
    const items = rows.slice(0, filter.limit).map(AttemptMapper.toDomain);
    return { items, hasMore };
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

  async saveAll(attempts: Attempt[]): Promise<void> {
    await this.prisma.$transaction(
      attempts.map((attempt) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = AttemptMapper.toPersistence(attempt) as any;
        return this.prisma.attempt.upsert({
          where: { id: data.id },
          create: data,
          update: data,
        });
      }),
    );
  }
}
