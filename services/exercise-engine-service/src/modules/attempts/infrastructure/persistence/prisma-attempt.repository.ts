import { Injectable } from '@nestjs/common';
import type {
  IAttemptRepository,
  FindForReviewFilter,
  FindUserAttemptsFilter,
  PendingLoadRow,
  ReviewDecisionsCursor,
  ReviewQueueCursor,
  ReviewQueueScope,
  ReviewQueueSummary,
  ReviewedLoadRow,
} from '../../domain/repositories/attempt.repository.js';
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

  async findLatestReturned(userId: string, exerciseId: string): Promise<Attempt | null> {
    const row = await this.prisma.attempt.findFirst({
      where: { userId, exerciseId, status: 'RETURNED' },
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

  /**
   * The queue of one or many exercises. Oldest first, because a submission that has been
   * waiting two days is the one a learner is still waiting on.
   *
   * An empty set is answered without touching the database: a course with no exercises of
   * a markable kind is a real case, and `IN ()` is not a query worth sending.
   */
  async findAllByExercises(
    exerciseIds: string[],
    filter: FindForReviewFilter,
  ): Promise<{ items: Attempt[]; total: number }> {
    if (exerciseIds.length === 0) return { items: [], total: 0 };

    const where = { exerciseId: { in: exerciseIds }, status: filter.status };

    const [rows, total] = await Promise.all([
      this.prisma.attempt.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip: filter.offset,
        take: filter.limit,
      }),
      this.prisma.attempt.count({ where }),
    ]);

    return { items: rows.map(AttemptMapper.toDomain), total };
  }

  /**
   * The scope as a `where`: school always, the rest only when the caller narrowed by it.
   *
   * `submittedAt: { not: null }` is not decoration — the queue is ordered and paged by
   * that column, and a null would sort into a position the cursor cannot name. A routed
   * attempt without a submission time cannot exist through the domain, but a backfilled
   * row could, and it would silently break paging rather than show up.
   */
  private reviewQueueWhere(scope: ReviewQueueScope) {
    return {
      schoolId: scope.schoolId,
      status: 'ROUTED_FOR_REVIEW' as const,
      submittedAt: { not: null },
      ...(scope.groupIds?.length ? { groupId: { in: scope.groupIds } } : {}),
      ...(scope.containerIds?.length ? { containerId: { in: scope.containerIds } } : {}),
      ...(scope.templateCodes?.length ? { templateCode: { in: scope.templateCodes } } : {}),
    };
  }

  async findReviewQueuePage(
    scope: ReviewQueueScope,
    page: { limit: number; after: ReviewQueueCursor | null },
  ): Promise<Attempt[]> {
    const after = page.after;
    const rows = await this.prisma.attempt.findMany({
      where: {
        ...this.reviewQueueWhere(scope),
        // Keyset, not skip: strictly later than the row the last page ended on, with the
        // id breaking a tie between two submissions of the same instant.
        ...(after
          ? {
              OR: [
                { submittedAt: { gt: after.submittedAt } },
                { submittedAt: after.submittedAt, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: page.limit,
    });

    return rows.map(AttemptMapper.toDomain);
  }

  async findPendingLoad(schoolId: string, limit: number): Promise<PendingLoadRow[]> {
    const rows = await this.prisma.attempt.findMany({
      where: { schoolId, status: 'ROUTED_FOR_REVIEW', submittedAt: { not: null } },
      // Oldest first, so that a school past the ceiling keeps the submissions oversight
      // exists to find rather than an arbitrary five thousand.
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        userId: true,
        exerciseId: true,
        containerId: true,
        groupId: true,
        submittedAt: true,
      },
    });

    return rows.map((row) => ({
      attemptId: row.id,
      userId: row.userId,
      exerciseId: row.exerciseId,
      containerId: row.containerId,
      groupId: row.groupId,
      // The `where` excludes nulls; the assertion keeps the row type honest without a
      // fallback time that would quietly age a submission.
      submittedAt: row.submittedAt as Date,
    }));
  }

  async findReviewedLoad(
    schoolId: string,
    since: Date,
    limit: number,
  ): Promise<ReviewedLoadRow[]> {
    const rows = await this.prisma.attempt.findMany({
      where: {
        schoolId,
        reviewedByUserId: { not: null },
        reviewedAt: { not: null, gte: since },
      },
      orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        reviewedByUserId: true,
        containerId: true,
        groupId: true,
        submittedAt: true,
        reviewedAt: true,
      },
    });

    return rows.map((row) => ({
      reviewerId: row.reviewedByUserId as string,
      containerId: row.containerId,
      groupId: row.groupId,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt as Date,
    }));
  }

  async earliestSubmissionAt(schoolId: string): Promise<Date | null> {
    const row = await this.prisma.attempt.findFirst({
      where: { schoolId, submittedAt: { not: null } },
      orderBy: { submittedAt: 'asc' },
      select: { submittedAt: true },
    });

    return row?.submittedAt ?? null;
  }

  async findReviewDecisionsPage(
    schoolId: string,
    since: Date,
    page: { limit: number; after: ReviewDecisionsCursor | null },
  ): Promise<Attempt[]> {
    const after = page.after;
    const rows = await this.prisma.attempt.findMany({
      where: {
        schoolId,
        reviewedByUserId: { not: null },
        reviewedAt: { not: null, gte: since },
        // Descending keyset: strictly earlier than the row the last page ended on.
        ...(after
          ? {
              OR: [
                { reviewedAt: { lt: after.reviewedAt } },
                { reviewedAt: after.reviewedAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
      take: page.limit,
    });

    return rows.map(AttemptMapper.toDomain);
  }

  async summariseReviewQueue(scope: ReviewQueueScope): Promise<ReviewQueueSummary> {
    const where = this.reviewQueueWhere(scope);

    const [pending, oldest] = await Promise.all([
      this.prisma.attempt.count({ where }),
      this.prisma.attempt.findFirst({
        where,
        orderBy: { submittedAt: 'asc' },
        select: { submittedAt: true },
      }),
    ]);

    return { pending, oldestSubmittedAt: oldest?.submittedAt ?? null };
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
