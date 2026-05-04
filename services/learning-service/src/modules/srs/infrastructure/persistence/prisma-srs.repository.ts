import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ISrsRepository, SrsStats } from '../../domain/repositories/srs-repository.interface.js';
import { ReviewCard, type SrsContentType } from '../../domain/entities/review-card.entity.js';
import { SrsCardMapper } from './srs-card.mapper.js';

@Injectable()
export class PrismaSrsRepository implements ISrsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ReviewCard | null> {
    const row = await this.prisma.srsReviewCard.findUnique({ where: { id } });
    return row ? SrsCardMapper.toDomain(row) : null;
  }

  async findByUserAndContent(
    userId: string,
    contentType: SrsContentType,
    contentId: string,
  ): Promise<ReviewCard | null> {
    const row = await this.prisma.srsReviewCard.findUnique({
      where: {
        userId_contentType_contentId: {
          userId,
          contentType: contentType as any,
          contentId,
        },
      },
    });
    return row ? SrsCardMapper.toDomain(row) : null;
  }

  async findDueCards(userId: string, limit: number, now: Date): Promise<ReviewCard[]> {
    const rows = await this.prisma.srsReviewCard.findMany({
      where: {
        userId,
        dueAt: { lte: now },
        state: { not: 'SUSPENDED' as any },
      },
      orderBy: { dueAt: 'asc' },
      take: limit,
    });
    return rows.map(SrsCardMapper.toDomain);
  }

  async save(card: ReviewCard): Promise<void> {
    const data = SrsCardMapper.toPersistence(card);
    await this.prisma.srsReviewCard.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async countNewToday(userId: string, since: Date): Promise<number> {
    return this.prisma.srsReviewCard.count({
      where: {
        userId,
        createdAt: { gte: since },
      },
    });
  }

  async countReviewedToday(userId: string, since: Date): Promise<number> {
    return this.prisma.srsReviewCard.count({
      where: {
        userId,
        lastReviewedAt: { gte: since },
      },
    });
  }

  async getStatsByUser(userId: string, now: Date): Promise<SrsStats> {
    const [counts, dueNow, reviewedToday] = await Promise.all([
      this.prisma.srsReviewCard.groupBy({
        by: ['state'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.srsReviewCard.count({
        where: { userId, dueAt: { lte: now }, state: { not: 'SUSPENDED' as any } },
      }),
      this.prisma.srsReviewCard.count({
        where: { userId, lastReviewedAt: { gte: startOfDayUtc(now) } },
      }),
    ]);

    const byState = Object.fromEntries(
      counts.map((g) => [g.state as string, g._count._all]),
    );

    return {
      newCount: byState['NEW'] ?? 0,
      learningCount: byState['LEARNING'] ?? 0,
      reviewCount: byState['REVIEW'] ?? 0,
      relearningCount: byState['RELEARNING'] ?? 0,
      suspendedCount: byState['SUSPENDED'] ?? 0,
      dueNowCount: dueNow,
      reviewedTodayCount: reviewedToday,
    };
  }
}

function startOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
