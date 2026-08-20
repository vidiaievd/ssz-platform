import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { DigestState } from './review-digest.composer.js';

/**
 * What each reviewer has already been told (plan 47.5).
 *
 * Small enough to read whole per run: one row per teacher who has ever had a queue, and
 * the job is holding the whole platform's pending load in memory by that point anyway.
 * Reading it up front keeps the composer pure — it is handed a map and decides, rather
 * than asking a database mid-decision.
 */
@Injectable()
export class ReviewDigestStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async load(userIds: string[]): Promise<Map<string, DigestState>> {
    if (userIds.length === 0) return new Map();

    const rows = await this.prisma.reviewDigestState.findMany({
      where: { userId: { in: [...new Set(userIds)] } },
    });

    return new Map(
      rows.map((row) => [
        row.userId,
        { lastMaxSubmittedAt: row.lastMaxSubmittedAt, lastEscalatedAt: row.lastEscalatedAt },
      ]),
    );
  }

  /**
   * Records that this teacher has been told about everything up to `maxSubmittedAt`.
   *
   * Written after the message, never before: a run that fails between the two says the
   * same thing twice, which is a nuisance. The other order says nothing at all about work
   * nobody has heard of, which is the failure this whole plan exists to end.
   */
  async recordDigest(userId: string, maxSubmittedAt: Date, at: Date): Promise<void> {
    await this.prisma.reviewDigestState.upsert({
      where: { userId },
      create: { userId, lastSentAt: at, lastMaxSubmittedAt: maxSubmittedAt },
      update: { lastSentAt: at, lastMaxSubmittedAt: maxSubmittedAt },
    });
  }

  /**
   * Records an escalation without touching the digest's mark.
   *
   * The two clocks are independent on purpose: hearing that something is late is not the
   * same as having been told what is waiting, and letting either silence the other would
   * lose one of the two messages.
   */
  async recordEscalation(userId: string, at: Date): Promise<void> {
    await this.prisma.reviewDigestState.upsert({
      where: { userId },
      // A teacher escalated to before any digest was ever sent still needs a row. The
      // epoch mark says "told about nothing so far", which is exactly true.
      create: { userId, lastSentAt: at, lastMaxSubmittedAt: new Date(0), lastEscalatedAt: at },
      update: { lastEscalatedAt: at },
    });
  }
}
