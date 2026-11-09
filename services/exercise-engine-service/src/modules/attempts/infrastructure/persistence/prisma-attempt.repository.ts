import { Injectable } from '@nestjs/common';
import type {
  IAttemptRepository,
  FindUserAttemptsFilter,
  MySubmissionsCursor,
  MySubmissionsStatus,
  PendingEffortRow,
  PendingLoadRow,
  PendingSchoolRow,
  ReviewDecisionsCursor,
  ReviewQueueCursor,
  ReviewQueueScope,
  ReviewQueueSummary,
  ReviewedLoadRow,
  ReviewTermRow,
} from '../../domain/repositories/attempt.repository.js';
import { TEMPLATE_CODE as INFLECTION_TABLE } from '@ssz/shared-kernel/inflection-table';
import { TEMPLATE_CODE as INFORMATION_TRANSFER } from '@ssz/shared-kernel/information-transfer';
import { Attempt } from '../../domain/entities/attempt.entity.js';
import type { HandlingTimeStat } from '../../domain/value-objects/review-effort-norm.js';
import { AttemptMapper } from './attempt.mapper.js';
import { OpenAttemptExistsError } from '../../domain/exceptions/attempt.errors.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

/**
 * A scored whole-board attempt whose last check left the table open — an `inflection_table`
 * (plan 69, phase 9) or an `information_transfer` blank (plan 73 §3.6).
 */
function isOpenBoard(attempt: Attempt): boolean {
  if (attempt.templateCode !== INFLECTION_TABLE && attempt.templateCode !== INFORMATION_TRANSFER) {
    return false;
  }
  const details = attempt.validationDetails as { closed?: unknown } | null | undefined;
  return details?.closed === false;
}

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

  async findOpenBoard(userId: string, exerciseId: string): Promise<Attempt | null> {
    const row = await this.prisma.attempt.findFirst({
      where: { userId, exerciseId, status: { not: 'IN_PROGRESS' } },
      orderBy: { startedAt: 'desc' },
    });
    if (!row || row.status !== 'SCORED') return null;
    const attempt = AttemptMapper.toDomain(row);
    return isOpenBoard(attempt) ? attempt : null;
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

  async countSubmitted(userId: string, exerciseId: string): Promise<number> {
    return this.prisma.attempt.count({
      where: { userId, exerciseId, submittedAt: { not: null } },
    });
  }

  async findScoredDetails(
    userId: string,
    templateCode: string,
    targetLanguage: string,
    limit: number,
  ): Promise<unknown[]> {
    const rows = await this.prisma.attempt.findMany({
      where: { userId, templateCode, targetLanguage, status: 'SCORED' },
      orderBy: { scoredAt: 'desc' },
      take: limit,
      select: { validationDetails: true },
    });
    return rows.map((row) => row.validationDetails);
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
    if (scope.acceptedAtTermSince) return this.findAcceptedAtTermPage(scope, page);

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

  async findSchoolsWithPendingReview(): Promise<PendingSchoolRow[]> {
    // Grouped in the database rather than read and counted here: the answer is a handful
    // of rows however large the queue behind it is, and the job that asks runs on a timer
    // with nobody watching it.
    const rows = await this.prisma.attempt.groupBy({
      by: ['schoolId'],
      where: { schoolId: { not: null }, status: 'ROUTED_FOR_REVIEW', submittedAt: { not: null } },
      _count: { _all: true },
      _min: { submittedAt: true },
      _max: { submittedAt: true },
    });

    return rows
      .filter((row) => row.schoolId !== null && row._min.submittedAt && row._max.submittedAt)
      .map((row) => ({
        schoolId: row.schoolId as string,
        pending: row._count._all,
        oldestSubmittedAt: row._min.submittedAt as Date,
        newestSubmittedAt: row._max.submittedAt as Date,
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

  async countPendingByGroupAndTemplate(schoolId: string): Promise<PendingEffortRow[]> {
    // The same predicate as `findPendingLoad`, grouped in the database: the forecast
    // needs how many, not which.
    const rows = await this.prisma.attempt.groupBy({
      by: ['groupId', 'templateCode'],
      where: { schoolId, status: 'ROUTED_FOR_REVIEW', submittedAt: { not: null } },
      _count: { _all: true },
    });

    return rows.map((row) => ({
      groupId: row.groupId,
      templateCode: row.templateCode,
      count: row._count._all,
    }));
  }

  async findHandlingTimeStats(schoolId: string, since: Date): Promise<HandlingTimeStat[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ template_code: string; sample_size: number; median_seconds: number }>
    >`
      SELECT template_code,
             count(*)::int AS sample_size,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY review_handling_seconds)::float8
               AS median_seconds
      FROM attempts
      WHERE school_id = ${schoolId}
        AND review_handling_seconds IS NOT NULL
        AND reviewed_at >= ${since}
      GROUP BY template_code`;
    return rows.map((row) => ({
      templateCode: row.template_code,
      sampleSize: row.sample_size,
      medianSeconds: row.median_seconds,
    }));
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

  /**
   * The three buckets as a `where`, or the union of all three for `'all'`.
   *
   * `SCORED` alone is not "approved" — a machine score is not a person's decision (the
   * same reading `deliveredVerdict()` and the decisions journal use) — so it always
   * carries `reviewedByUserId: { not: null }` alongside it.
   */
  async findAiDraftedIds(attemptIds: string[]): Promise<Set<string>> {
    if (attemptIds.length === 0) return new Set();
    // Read straight off the drafts table: the drafts module imports this one, so going
    // through its repository would be a cycle for one boolean per row.
    const rows = await this.prisma.attemptAiDraft.findMany({
      where: {
        attemptId: { in: attemptIds },
        // A school that has a model answer first (plan 80) has its teacher sign off the
        // model's review to the learner instead of a draft — by ear for a reading (plan 82).
        capability: { in: ['review_draft', 'review_direct', 'voice_review'] },
        status: { in: ['SENT', 'EDITED'] },
      },
      select: { attemptId: true },
    });
    return new Set(rows.map((row) => row.attemptId));
  }

  private mySubmissionsWhere(userId: string, status: MySubmissionsStatus) {
    const base = { userId, submittedAt: { not: null } };
    // A score somebody delivered: a teacher's signature, or a model's review of the work of
    // a learner nobody reviews — the one delivery with no signature (plan 79, 2.3).
    const delivered = {
      status: 'SCORED' as const,
      OR: [{ reviewedByUserId: { not: null } }, { reviewedAt: { not: null } }],
    };
    if (status === 'pending') return { ...base, status: 'ROUTED_FOR_REVIEW' as const };
    if (status === 'returned') return { ...base, status: 'RETURNED' as const };
    if (status === 'approved') return { ...base, ...delivered };
    return {
      ...base,
      OR: [{ status: 'ROUTED_FOR_REVIEW' as const }, { status: 'RETURNED' as const }, delivered],
    };
  }

  async findMySubmissionsPage(
    userId: string,
    status: MySubmissionsStatus,
    page: { limit: number; after: MySubmissionsCursor | null },
  ): Promise<Attempt[]> {
    const after = page.after;
    const bucket = this.mySubmissionsWhere(userId, status);
    // `bucket` may itself be an `OR` (the `'all'` case, across the three statuses) — nested
    // under its own `AND` entry rather than spread alongside the keyset's `OR`, so the two
    // do not collide on the same object key and silently drop one of them.
    const where = after
      ? {
          AND: [
            bucket,
            {
              OR: [
                { submittedAt: { lt: after.submittedAt } },
                { submittedAt: after.submittedAt, id: { lt: after.id } },
              ],
            },
          ],
        }
      : bucket;

    const rows = await this.prisma.attempt.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: page.limit,
    });

    return rows.map(AttemptMapper.toDomain);
  }

  /**
   * `DISTINCT ON` picks each exercise's latest scored attempt; the outer filter keeps those
   * that failed. Raw because Prisma has no `DISTINCT ON` with an ordering per group. Ids and
   * the total only, then read through the mapper like the other raw pages.
   */
  async findLatestMistakes(
    userId: string,
    options: { courseId: string | null; limit: number },
  ): Promise<{ attempts: Attempt[]; total: number }> {
    const ids = await this.prisma.$queryRaw<Array<{ id: string; total: bigint }>>`
      WITH latest AS (
        SELECT DISTINCT ON (exercise_id) id, passed, scored_at
        FROM attempts
        WHERE user_id = ${userId}
          AND status = 'scored'
          AND NOT ephemeral
          AND container_id IS NOT NULL
          AND reviewed_at IS NULL
          AND scored_at IS NOT NULL
          AND (${options.courseId}::text IS NULL OR container_id = ${options.courseId}::text)
        ORDER BY exercise_id, scored_at DESC, id DESC
      )
      SELECT id, COUNT(*) OVER () AS total
      FROM latest
      WHERE passed IS FALSE
      ORDER BY scored_at DESC, id DESC
      LIMIT ${options.limit}`;
    if (ids.length === 0) return { attempts: [], total: 0 };

    const rows = await this.prisma.attempt.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    const order = new Map(ids.map((row, index) => [row.id, index]));
    return {
      attempts: rows
        .map(AttemptMapper.toDomain)
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
      total: Number(ids[0].total),
    };
  }

  /**
   * The scope's work closed at the term (`Attempt.acceptedAtTerm`, plan 80, step 7f), paged
   * like the queue: delivered without a signature, the provisional verdict kept on it.
   *
   * Raw for the same JSON null test as `findDueAiVerdictIds`; ids only, then read through the
   * mapper. The cursor's time is turned back into the column's own zone-less UTC, so the
   * keyset compares like with like.
   */
  private async findAcceptedAtTermPage(
    scope: ReviewQueueScope,
    page: { limit: number; after: ReviewQueueCursor | null },
  ): Promise<Attempt[]> {
    const filter = this.acceptedAtTermFilter(scope);
    const afterAt = page.after?.submittedAt ?? null;
    const afterId = page.after?.id ?? null;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM attempts
      WHERE school_id = ${scope.schoolId}
        AND status IN ('scored', 'returned')
        AND reviewed_by_user_id IS NULL
        AND reviewed_at >= ${filter.since}
        AND submitted_at IS NOT NULL
        AND review_ai_verdict IS NOT NULL
        AND jsonb_typeof(review_ai_verdict) = 'object'
        AND (${filter.groupIds}::text[] IS NULL OR group_id = ANY(${filter.groupIds}::text[]))
        AND (${filter.containerIds}::text[] IS NULL OR container_id = ANY(${filter.containerIds}::text[]))
        AND (${filter.templateCodes}::text[] IS NULL OR template_code = ANY(${filter.templateCodes}::text[]))
        AND (
          ${afterAt}::timestamptz IS NULL
          OR (submitted_at, id) > ((${afterAt}::timestamptz AT TIME ZONE 'UTC'), ${afterId}::text)
        )
      ORDER BY submitted_at, id
      LIMIT ${page.limit}`;
    if (ids.length === 0) return [];

    const rows = await this.prisma.attempt.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    const order = new Map(ids.map((row, index) => [row.id, index]));
    return rows
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map(AttemptMapper.toDomain);
  }

  private async summariseAcceptedAtTerm(scope: ReviewQueueScope): Promise<ReviewQueueSummary> {
    const filter = this.acceptedAtTermFilter(scope);
    const [row] = await this.prisma.$queryRaw<Array<{ pending: number; oldest: Date | null }>>`
      SELECT count(*)::int AS pending, min(submitted_at) AS oldest
      FROM attempts
      WHERE school_id = ${scope.schoolId}
        AND status IN ('scored', 'returned')
        AND reviewed_by_user_id IS NULL
        AND reviewed_at >= ${filter.since}
        AND submitted_at IS NOT NULL
        AND review_ai_verdict IS NOT NULL
        AND jsonb_typeof(review_ai_verdict) = 'object'
        AND (${filter.groupIds}::text[] IS NULL OR group_id = ANY(${filter.groupIds}::text[]))
        AND (${filter.containerIds}::text[] IS NULL OR container_id = ANY(${filter.containerIds}::text[]))
        AND (${filter.templateCodes}::text[] IS NULL OR template_code = ANY(${filter.templateCodes}::text[]))`;
    return { pending: row?.pending ?? 0, oldestSubmittedAt: row?.oldest ?? null };
  }

  /** An unnarrowed dimension goes in as SQL NULL, which the predicate reads as "any". */
  private acceptedAtTermFilter(scope: ReviewQueueScope) {
    return {
      since: scope.acceptedAtTermSince ?? new Date(0),
      groupIds: scope.groupIds?.length ? scope.groupIds : null,
      containerIds: scope.containerIds?.length ? scope.containerIds : null,
      templateCodes: scope.templateCodes?.length ? scope.templateCodes : null,
    };
  }

  async summariseReviewQueue(scope: ReviewQueueScope): Promise<ReviewQueueSummary> {
    if (scope.acceptedAtTermSince) return this.summariseAcceptedAtTerm(scope);

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

  async findRecordingsInUse(assetIds: readonly string[], liveDraftSince: Date): Promise<string[]> {
    if (assetIds.length === 0) return [];

    // jsonpath over the two shapes `read_aloud` writes (kernel `submission.ts`):
    //   submitted_answer { recordings: [{ assetId, discarded?: [{ assetId }] }] }
    //   draft_answer     { takes: { [itemId]: [{ assetId }] } }
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT a.id
      FROM unnest(${[...assetIds]}::text[]) AS a(id)
      WHERE EXISTS (
        SELECT 1
        FROM attempts t
        WHERE t.template_code = 'read_aloud'
          AND (
            jsonb_path_exists(
              t.submitted_answer,
              '$.recordings[*] ? (@.assetId == $id || @.discarded[*].assetId == $id)',
              jsonb_build_object('id', a.id)
            )
            OR (
              t.status = 'in_progress'
              AND t.draft_saved_at >= ${liveDraftSince}
              AND jsonb_path_exists(
                t.draft_answer,
                '$.takes.*[*] ? (@.assetId == $id)',
                jsonb_build_object('id', a.id)
              )
            )
          )
      )`;
    return rows.map((row) => row.id);
  }

  async findDueAiVerdictIds(now: Date, limit: number): Promise<string[]> {
    // Raw for the JSON null test, which Prisma's filter only spells with a client value
    // (`Prisma.DbNull`) — and importing the client as a value breaks the test suites. The
    // mapper's null lands as JSON `null`, not SQL NULL, hence the type test; the IS NOT NULL
    // beside it is the partial index's own predicate, for the planner.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM attempts
      WHERE status = 'routed_for_review'
        AND review_ai_verdict IS NOT NULL
        AND jsonb_typeof(review_ai_verdict) = 'object'
        AND review_auto_accept_at <= ${now}
      ORDER BY review_auto_accept_at, id
      LIMIT ${limit}`;
    return rows.map((row) => row.id);
  }

  async findTeacherReviewed(templateCode: string, limit: number): Promise<Attempt[]> {
    // A model's verdict leaves `reviewedByUserId` empty, so the person is the filter. Rows
    // without decisions are the caller's to count — the JSON null test needs a client value.
    const rows = await this.prisma.attempt.findMany({
      where: { templateCode, reviewedByUserId: { not: null }, reviewedAt: { not: null } },
      orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(AttemptMapper.toDomain);
  }

  async findReviewTermsAhead(
    schoolId: string,
    after: Date,
    until: Date,
    limit: number,
  ): Promise<ReviewTermRow[]> {
    // The term job's own predicate (`findDueAiVerdictIds`), narrowed to a school and moved
    // forward in time: a warning names exactly the work that job is going to close.
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        container_id: string | null;
        group_id: string | null;
        submitted_at: Date;
        review_auto_accept_at: Date;
      }>
    >`
      SELECT id, container_id, group_id, submitted_at, review_auto_accept_at
      FROM attempts
      WHERE school_id = ${schoolId}
        AND status = 'routed_for_review'
        AND submitted_at IS NOT NULL
        AND review_ai_verdict IS NOT NULL
        AND jsonb_typeof(review_ai_verdict) = 'object'
        AND review_auto_accept_at > ${after}
        AND review_auto_accept_at <= ${until}
      ORDER BY review_auto_accept_at, id
      LIMIT ${limit}`;
    return rows.map((row) => ({
      attemptId: row.id,
      containerId: row.container_id,
      groupId: row.group_id,
      submittedAt: row.submitted_at,
      autoAcceptAt: row.review_auto_accept_at,
    }));
  }

  async save(attempt: Attempt): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = AttemptMapper.toPersistence(attempt) as any;
    try {
      await this.prisma.attempt.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new OpenAttemptExistsError();
      throw err;
    }
  }

  async saveIfInReview(attempt: Attempt): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { id, ...data } = AttemptMapper.toPersistence(attempt) as any;
    const { count } = await this.prisma.attempt.updateMany({
      where: { id, status: 'ROUTED_FOR_REVIEW' },
      data,
    });
    return count === 1;
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

/**
 * Prisma's P2002, recognised by its code rather than its class: importing the client as a
 * value breaks the test suites that import this module. The upsert is keyed by id, so the one
 * unique rule it can break is the open-attempt index (plan 76, 2.5).
 */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}
