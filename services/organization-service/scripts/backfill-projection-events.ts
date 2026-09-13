// One-off backfill: re-announce workspaces whose rows were written without events.
//
// Two sources of such rows, both from plan 59:
//   * the SQL migration of phase 1, which moved live `tutoring_groups` into SOLO
//     workspaces by writing tables directly — no domain command ran, so nothing was
//     published;
//   * invitations accepted before `accept-invitation` learned to send
//     `school.group.member.added` (phase 4) — those learners sit in a group no
//     neighbour ever heard about.
//
// Without this the analytics projections have no row for the workspace, and a screen
// that asks "is this group in GroupDirectory, and is the viewer in SchoolMembership?"
// answers "group not found" — plan 59 §1.1 F.
//
// Safe to run more than once: every consumer of these four events upserts, and the
// events are written to the outbox the same way the service writes its own, so the
// dispatcher publishes them in order.
//
// Run (compiles first — ts-node's ESM loader cannot resolve the generated client):
//   npm run backfill:projection-events -- [flags]
// Flags:
//   --dry-run          report what would be written, write nothing
//   --school=<uuid>    just this workspace (default: every SOLO workspace)
//   --all-kinds        every workspace, school or solo — for a full projection rebuild
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const EXCHANGE = 'organization.events';
const SOURCE = 'organization-service';

const DRY_RUN = process.argv.includes('--dry-run');
const ALL_KINDS = process.argv.includes('--all-kinds');
const ONLY_SCHOOL = process.argv
  .find((arg) => arg.startsWith('--school='))
  ?.slice('--school='.length);

interface Announcement {
  eventType: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

/** The envelope the service's own publisher writes, so consumers see no difference. */
function outboxRow(announcement: Announcement) {
  const eventId = randomUUID();
  const payload = {
    eventId,
    eventType: announcement.eventType,
    occurredAt: announcement.occurredAt.toISOString(),
    ...announcement.payload,
  };

  return {
    id: randomUUID(),
    eventId,
    eventType: announcement.eventType,
    exchange: EXCHANGE,
    routingKey: announcement.eventType,
    payload: JSON.stringify({
      eventId,
      eventType: announcement.eventType,
      eventVersion: '1.0',
      occurredAt: announcement.occurredAt.toISOString(),
      source: SOURCE,
      payload,
    }),
    correlationId: null,
    occurredAt: announcement.occurredAt,
  };
}

async function announcementsFor(
  prisma: PrismaClient,
  school: { id: string; name: string; ownerId: string; createdAt: Date },
): Promise<Announcement[]> {
  const out: Announcement[] = [];

  // The school itself, which is what creates the owner's SchoolMembership row.
  out.push({
    eventType: 'school.created',
    occurredAt: school.createdAt,
    payload: { schoolId: school.id, ownerId: school.ownerId, name: school.name },
  });

  const members = await prisma.schoolMember.findMany({
    where: { schoolId: school.id },
    select: { userId: true, role: true, joinedAt: true },
  });
  for (const member of members) {
    out.push({
      eventType: 'school.member.added',
      occurredAt: member.joinedAt,
      payload: { schoolId: school.id, userId: member.userId, role: member.role },
    });
  }

  const groups = await (prisma as any).schoolGroup.findMany({
    where: { schoolId: school.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      courseId: true,
      lang: true,
      level: true,
      createdAt: true,
      members: {
        where: { status: 'active' },
        select: { userId: true, addedAt: true },
      },
    },
  });

  for (const group of groups) {
    // A draft group was never published, and saying it was would put a group the school
    // is not teaching on the analytics screens.
    if (group.status !== 'active') continue;

    out.push({
      eventType: 'school.group.published',
      occurredAt: group.createdAt,
      payload: {
        schoolId: school.id,
        groupId: group.id,
        groupName: group.name,
        courseId: group.courseId ?? null,
        lang: group.lang ?? null,
        level: group.level ?? null,
      },
    });

    for (const member of group.members) {
      out.push({
        eventType: 'school.group.member.added',
        occurredAt: member.addedAt,
        payload: {
          schoolId: school.id,
          groupId: group.id,
          userId: member.userId,
          courseId: group.courseId ?? null,
          groupStatus: group.status,
          addedAt: member.addedAt.toISOString(),
        },
      });
    }
  }

  return out;
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] as string });
  const prisma = new PrismaClient({ adapter });

  try {
    const schools = await (prisma as any).school.findMany({
      where: {
        deletedAt: null,
        ...(ONLY_SCHOOL ? { id: ONLY_SCHOOL } : {}),
        ...(ALL_KINDS || ONLY_SCHOOL ? {} : { kind: 'SOLO' }),
      },
      select: { id: true, name: true, ownerId: true, kind: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    console.log(
      `Re-announcing ${schools.length} workspace(s)${DRY_RUN ? ' — DRY RUN' : ''}`,
    );

    let written = 0;
    for (const school of schools) {
      const announcements = await announcementsFor(prisma, school);
      const counts = announcements.reduce<Record<string, number>>((acc, a) => {
        acc[a.eventType] = (acc[a.eventType] ?? 0) + 1;
        return acc;
      }, {});

      console.log(
        `  ${school.kind} ${school.name} [${school.id}]: ` +
          Object.entries(counts)
            .map(([type, count]) => `${type} ×${count}`)
            .join(', '),
      );

      if (DRY_RUN) continue;

      for (const announcement of announcements) {
        await prisma.outbox.create({ data: outboxRow(announcement) });
        written += 1;
      }
    }

    console.log(
      DRY_RUN
        ? 'Nothing written.'
        : `Done — ${written} event(s) queued in the outbox; the dispatcher publishes them.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
