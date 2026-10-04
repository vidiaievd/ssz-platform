import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ISrsRepository, SrsStats } from '../../domain/repositories/srs-repository.interface.js';
import {
  ReviewCard,
  SHADOW_CONTENT_TYPES,
  type SrsContentType,
} from '../../domain/entities/review-card.entity.js';
import type { SrsTrack } from '../../domain/value-objects/srs-track.js';
import { SrsCardMapper, toPrismaTrack } from './srs-card.mapper.js';
import { gapCardContentId } from '../../domain/gap-card-id.js';

@Injectable()
export class PrismaSrsRepository implements ISrsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every query below that answers a learner carries this (plan 63 phase 5).
   *
   * Shadow cards are rated by the same attempts as the real ones, so without it they
   * would show up in the due queue, in the stats, and in a streak the learner never
   * earned — and a comparison whose act of measuring changes the thing measured is not
   * a comparison. Addressed by content type rather than by a flag on the row: a card
   * nothing can render is invisible for what it is, not for who wrote it.
   */
  private get notShadow() {
    return { contentType: { notIn: SHADOW_CONTENT_TYPES as unknown as any[] } };
  }

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

  async findDueCards(
    userId: string,
    limit: number,
    now: Date,
    track?: SrsTrack,
  ): Promise<ReviewCard[]> {
    const rows = await this.prisma.srsReviewCard.findMany({
      where: {
        userId,
        dueAt: { lte: now },
        state: { not: 'SUSPENDED' as any },
        // Absent rather than both tracks when nobody asked: a client that wants one
        // memory says so, and one that wants the day's work gets the day's work.
        ...(track ? { track: toPrismaTrack(track) as any } : {}),
        ...this.notShadow,
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
        ...this.notShadow,
      },
    });
  }

  async countReviewedToday(userId: string, since: Date): Promise<number> {
    return this.prisma.srsReviewCard.count({
      where: {
        userId,
        lastReviewedAt: { gte: since },
        ...this.notShadow,
      },
    });
  }

  async getStatsByUser(userId: string, now: Date): Promise<SrsStats> {
    const [counts, dueNow, reviewedToday] = await Promise.all([
      this.prisma.srsReviewCard.groupBy({
        by: ['state'],
        where: { userId, ...this.notShadow },
        _count: { _all: true },
      }),
      this.prisma.srsReviewCard.count({
        where: { userId, dueAt: { lte: now }, state: { not: 'SUSPENDED' as any }, ...this.notShadow },
      }),
      this.prisma.srsReviewCard.count({
        where: { userId, lastReviewedAt: { gte: startOfDayUtc(now) }, ...this.notShadow },
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
      where: { userId, lastReviewedAt: { gte: cutoff, not: null }, ...this.notShadow },
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

  async deleteGapCardsExcept(exerciseId: string, keepKeys: readonly string[]): Promise<string[]> {
    // The prefix is the card id with an empty key: `<exerciseId>#`. Prisma escapes it for LIKE.
    const where = {
      contentType: 'EXERCISE_GAP' as any,
      contentId: {
        startsWith: gapCardContentId(exerciseId, ''),
        notIn: keepKeys.map((key) => gapCardContentId(exerciseId, key)),
      },
    };
    const doomed = await this.prisma.srsReviewCard.findMany({
      where,
      select: { id: true, userId: true },
    });
    if (doomed.length === 0) return [];

    await this.prisma.srsReviewCard.deleteMany({ where: { id: { in: doomed.map((c) => c.id) } } });
    return [...new Set(doomed.map((c) => c.userId))];
  }
}

function startOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
