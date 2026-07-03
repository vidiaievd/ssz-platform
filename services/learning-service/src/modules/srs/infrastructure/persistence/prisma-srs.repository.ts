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

  async findByUserAndContents(
    userId: string,
    contentType: SrsContentType,
    contentIds: string[],
  ): Promise<ReviewCard[]> {
    if (contentIds.length === 0) return [];
    const rows = await this.prisma.srsReviewCard.findMany({
      where: { userId, contentType: contentType as any, contentId: { in: contentIds } },
    });
    return rows.map(SrsCardMapper.toDomain);
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

  async getStreakDays(userId: string, now: Date): Promise<number> {
    // Find distinct UTC days on which the user completed at least one review,
    // by fetching the most-recent distinct lastReviewedAt days and counting
    // how many consecutive days ending on today (or yesterday) are present.
    // We cap at 366 days of look-back to bound the query.
    const cutoff = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);
    const cards = await this.prisma.srsReviewCard.findMany({
      where: { userId, lastReviewedAt: { gte: cutoff, not: null } },
      select: { lastReviewedAt: true },
    });

    const daySet = new Set<string>();
    for (const { lastReviewedAt } of cards) {
      if (lastReviewedAt) {
        daySet.add(lastReviewedAt.toISOString().slice(0, 10));
      }
    }

    let streak = 0;
    const cursor = startOfDayUtc(now);
    // Accept activity today OR ending yesterday (if the user hasn't reviewed today yet).
    const todayStr = cursor.toISOString().slice(0, 10);
    if (!daySet.has(todayStr)) {
      // Nothing reviewed today — check if streak is alive from yesterday.
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    while (daySet.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
  }
}

function startOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
