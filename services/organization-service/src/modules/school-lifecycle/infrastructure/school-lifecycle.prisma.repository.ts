import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { recordAdminAction } from '../../../infrastructure/audit/record-admin-action.js';
import { outboxRowOf } from '../../../infrastructure/messaging/outbox-event-publisher.service.js';
import type { AdminAuditEntry } from '../../../shared/application/admin-audit.js';
import type { IDomainEvent } from '../../../shared/domain/domain-event.interface.js';
import type {
  ISchoolLifecycleRepository,
  ISchoolLifecycleTimerRepository,
  LifecycleDueWork,
  PurgeCounts,
} from '../domain/school-lifecycle.repository.js';
import {
  isActiveStatus,
  type PurgeReminder,
  type SchoolLifecycleState,
  type SchoolStatusChange,
} from '../domain/school-lifecycle.js';

const SELECT = {
  id: true,
  ownerId: true,
  name: true,
  kind: true,
  status: true,
  statusChangedAt: true,
  closesAt: true,
  purgeAt: true,
  statusReason: true,
  deletedAt: true,
} as const;

type Row = Prisma.SchoolGetPayload<{ select: typeof SELECT }>;

/** Key of the timer's advisory lock: one lifecycle run at a time across instances. */
const TIMER_LOCK = 'organization:school-lifecycle';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The only writer of `status`, `status_changed_at`, `closes_at`, `purge_at`, `status_reason`, the
 * reminder marks and the mirrors `isActive` / `deletedAt` (the aggregate's save leaves them alone).
 */
@Injectable()
export class SchoolLifecyclePrismaRepository implements ISchoolLifecycleRepository, ISchoolLifecycleTimerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(schoolId: string): Promise<SchoolLifecycleState | null> {
    const row = await this.prisma.school.findUnique({ where: { id: schoolId }, select: SELECT });
    return row ? toState(row) : null;
  }

  async apply(change: SchoolStatusChange, events: IDomainEvent[], audit: AdminAuditEntry | null): Promise<boolean> {
    const { before, after } = change;
    const rows = events.map(outboxRowOrThrow);
    // A real move starts the reminders over (a restored school closed again is told again); an
    // early-purge request keeps them — the purge is next anyway.
    const statusMoved = before.status !== after.status;

    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set on what the move was decided from: a second admin (or the timer) acting on
      // the same school at the same moment finds it moved and gets a conflict, not a double move.
      const { count } = await tx.school.updateMany({
        where: { id: after.schoolId, status: before.status, purgeAt: before.purgeAt },
        data: {
          status: after.status,
          statusChangedAt: after.statusChangedAt,
          closesAt: after.closesAt,
          purgeAt: after.purgeAt,
          statusReason: after.statusReason,
          isActive: isActiveStatus(after.status),
          deletedAt: after.deletedAt,
          ...(statusMoved ? { purgeReminded30At: null, purgeReminded7At: null } : {}),
          updatedAt: change.at,
        },
      });
      if (count === 0) return false;

      for (const row of rows) await tx.outbox.create({ data: row });
      if (audit) await recordAdminAction(tx, audit);
      return true;
    });
  }

  async withTimerLock(work: () => Promise<void>): Promise<boolean> {
    // A transaction-level lock on a connection of its own, held while `work` runs on others: it goes
    // away with the transaction, so a crashed run never leaves it behind.
    return this.prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${TIMER_LOCK}, 0)) AS locked`;
        if (!locked) return false;
        await work();
        return true;
      },
      { maxWait: 10_000, timeout: 30 * 60_000 },
    );
  }

  async findDue(now: Date, limit: number): Promise<LifecycleDueWork> {
    const in30 = new Date(now.getTime() + 30 * DAY_MS);
    const in7 = new Date(now.getTime() + 7 * DAY_MS);
    const [closing, purging, reminding] = await Promise.all([
      this.prisma.school.findMany({
        where: { status: 'suspended', closesAt: { lte: now } },
        orderBy: [{ closesAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: { id: true },
      }),
      this.prisma.school.findMany({
        where: { status: 'closed', purgeAt: { lte: now } },
        orderBy: [{ purgeAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: SELECT,
      }),
      this.prisma.school.findMany({
        where: {
          status: 'closed',
          purgeAt: { gt: now, lte: in30 },
          OR: [{ purgeReminded30At: null }, { purgeReminded7At: null, purgeAt: { lte: in7 } }],
        },
        orderBy: [{ purgeAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: { ...SELECT, purgeReminded30At: true, purgeReminded7At: true },
      }),
    ]);
    return {
      closing: closing.map((r) => r.id),
      purging: purging.map(toState),
      reminding: reminding.map((r) => ({
        state: { ...toState(r), purgeAt: r.purgeAt! },
        sent: { thirty: r.purgeReminded30At !== null, seven: r.purgeReminded7At !== null },
      })),
    };
  }

  async purge(
    before: SchoolLifecycleState,
    after: SchoolLifecycleState,
    event: IDomainEvent,
  ): Promise<PurgeCounts | null> {
    const row = outboxRowOrThrow(event);
    const schoolId = before.schoolId;

    return this.prisma.$transaction(
      async (tx) => {
        // The tombstone first: it locks the row, and a school restored meanwhile stops the purge here.
        const { count } = await tx.school.updateMany({
          where: { id: schoolId, status: 'closed', purgeAt: before.purgeAt },
          data: {
            status: 'purged',
            statusChangedAt: after.statusChangedAt,
            closesAt: null,
            isActive: false,
            updatedAt: after.statusChangedAt ?? new Date(),
            // A tombstone keeps the name, slug, owner, kind and dates — for the trail and the panel.
            description: null,
            avatarUrl: null,
            website: null,
            contactEmail: null,
            city: null,
            assistantGroupIds: [],
            assistantStudentIds: [],
            reviewEffortMinutes: {},
          },
        });
        if (count === 0) return null;

        const groups = { group: { schoolId } };
        // Children before parents: groups, roster rows and invitations are RESTRICT towards schools.
        const counts: PurgeCounts = {
          groupMaterials: (await tx.groupMaterial.deleteMany({ where: groups })).count,
          groupTeachers: (await tx.groupTeacher.deleteMany({ where: groups })).count,
          groupMembers: (await tx.schoolGroupMember.deleteMany({ where: groups })).count,
          groups: (await tx.schoolGroup.deleteMany({ where: { schoolId } })).count,
          invitations: (await tx.schoolInvitation.deleteMany({ where: { schoolId } })).count,
          applications: (await tx.schoolMembership.deleteMany({ where: { schoolId } })).count,
          permissions: (await tx.schoolMemberPermission.deleteMany({ where: { schoolId } })).count,
          teacherAttrs: (await tx.schoolTeacher.deleteMany({ where: { schoolId } })).count,
          members: (await tx.schoolMember.deleteMany({ where: { schoolId } })).count,
          nudges: (await tx.studentNudge.deleteMany({ where: { schoolId } })).count,
          reviewerReminders: (await tx.reviewerReminder.deleteMany({ where: { schoolId } })).count,
          levelHistory: (await tx.studentLevelHistory.deleteMany({ where: { schoolId } })).count,
          onboardingSettings: (await tx.schoolOnboardingSettings.deleteMany({ where: { schoolId } })).count,
          seatLimit: (await tx.schoolSeatLimit.deleteMany({ where: { schoolId } })).count,
        };

        await tx.outbox.create({ data: row });
        return counts;
      },
      { timeout: 60_000 },
    );
  }

  async markReminded(
    state: SchoolLifecycleState & { purgeAt: Date },
    reminder: PurgeReminder,
    event: IDomainEvent,
    now: Date,
  ): Promise<boolean> {
    const row = outboxRowOrThrow(event);
    return this.prisma.$transaction(async (tx) => {
      // Only while still closed with the same date and not yet marked: two runs never tell twice.
      const where: Prisma.SchoolWhereInput = { id: state.schoolId, status: 'closed', purgeAt: state.purgeAt };
      const { count } =
        reminder === 7
          ? await tx.school.updateMany({ where: { ...where, purgeReminded7At: null }, data: { purgeReminded7At: now } })
          : await tx.school.updateMany({ where: { ...where, purgeReminded30At: null }, data: { purgeReminded30At: now } });
      if (count === 0) return false;
      // The 7-day reminder stands for the 30-day one it overtook.
      if (reminder === 7) {
        await tx.school.updateMany({
          where: { id: state.schoolId, purgeReminded30At: null },
          data: { purgeReminded30At: now },
        });
      }
      await tx.outbox.create({ data: row });
      return true;
    });
  }
}

function toState(row: Row): SchoolLifecycleState {
  return {
    schoolId: row.id,
    ownerId: row.ownerId,
    name: row.name,
    kind: row.kind,
    status: row.status,
    statusChangedAt: row.statusChangedAt,
    closesAt: row.closesAt,
    purgeAt: row.purgeAt,
    statusReason: row.statusReason,
    deletedAt: row.deletedAt,
  };
}

function outboxRowOrThrow(event: IDomainEvent) {
  const row = outboxRowOf(event);
  // A lifecycle event without a routing key would be lost silently after the commit.
  if (!row) throw new Error(`No routing key for event type "${event.eventType}"`);
  return row;
}
