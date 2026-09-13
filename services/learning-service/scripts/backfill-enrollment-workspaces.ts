// One-off backfill: give enrolments a workspace they were stored without.
//
// An enrolment row carries the workspace the learner studies in, and until plan 59 §4
// nobody filled it in unless the caller named a school. On a private tutor's own course
// nobody names anything, so every such row was written with `school_id = NULL` — and the
// tutor's dashboard, which counts students as DISTINCT active enrolments of its
// workspace, answered zero for students it can see on its own roster.
//
// The rule is the one the review queue learned in phase 3: the workspace comes from the
// *learner*, with the course and its author as tie-breaks — organization-service answers
// it at `internal/students/:userId/review-context`.
//
// Each repaired row is re-announced through the outbox with its original dates, so the
// analytics projection is corrected the same way it was first written. Safe to run more
// than once: only rows still missing a workspace are touched, and the consumer upserts.
//
// Run (compiles first — ts-node's ESM loader cannot resolve the generated client):
//   npm run backfill:enrollment-workspaces -- [flags]
// Flags:
//   --dry-run       report what would be written, write nothing
//   --user=<uuid>   just this learner's enrolments
//   --replay        rows that already carry a workspace too — re-announces their history
//                   for a projection rebuild
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const EXCHANGE = 'learning.events';
const SOURCE = 'learning-service';

const DRY_RUN = process.argv.includes('--dry-run');
const REPLAY = process.argv.includes('--replay');
const ONLY_USER = process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length);

const ORG_URL = process.env.ORGANIZATION_SERVICE_URL;
const CONTENT_URL = process.env.CONTENT_SERVICE_URL;
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

interface ContainerOwner {
  ownerUserId: string;
  ownerSchoolId: string | null;
}

const ownerCache = new Map<string, ContainerOwner | null>();

async function internalGet<T>(base: string, path: string): Promise<T | null> {
  const res = await fetch(`${base}/api/v1/internal${path}`, {
    headers: { 'x-internal-token': TOKEN! },
  });
  if (!res.ok) {
    console.warn(`  ! ${path} → ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

async function ownerOf(containerId: string): Promise<ContainerOwner | null> {
  if (!ownerCache.has(containerId)) {
    ownerCache.set(
      containerId,
      await internalGet<ContainerOwner>(CONTENT_URL!, `/containers/${containerId}/directory`),
    );
  }
  return ownerCache.get(containerId) ?? null;
}

async function workspaceOf(userId: string, containerId: string): Promise<string | null> {
  const owner = await ownerOf(containerId);
  const params = new URLSearchParams({ courseId: containerId });
  if (owner?.ownerSchoolId) params.set('preferredSchoolId', owner.ownerSchoolId);
  if (owner?.ownerUserId) params.set('preferredTeacherId', owner.ownerUserId);

  const context = await internalGet<{ schoolId: string | null }>(
    ORG_URL!,
    `/students/${userId}/review-context?${params.toString()}`,
  );
  return context?.schoolId ?? null;
}

/** The envelope the service's own publisher writes, so consumers see no difference. */
function outboxRow(eventType: string, occurredAt: Date, payload: Record<string, unknown>) {
  const eventId = randomUUID();
  return {
    id: randomUUID(),
    eventId,
    eventType,
    exchange: EXCHANGE,
    routingKey: eventType,
    payload: JSON.stringify({
      eventId,
      eventType,
      eventVersion: '1.0',
      occurredAt: occurredAt.toISOString(),
      source: SOURCE,
      payload,
    }),
    correlationId: null,
    occurredAt,
  };
}

async function main(): Promise<void> {
  for (const [name, value] of Object.entries({
    DATABASE_URL,
    ORGANIZATION_SERVICE_URL: ORG_URL,
    CONTENT_SERVICE_URL: CONTENT_URL,
    INTERNAL_SERVICE_TOKEN: TOKEN,
  })) {
    if (!value) throw new Error(`${name} is not set`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL! }) });

  const rows = await prisma.enrollment.findMany({
    where: {
      ...(REPLAY ? {} : { schoolId: null }),
      deletedAt: null,
      ...(ONLY_USER ? { userId: ONLY_USER } : {}),
    },
    orderBy: { enrolledAt: 'asc' },
  });

  console.log(
    `${rows.length} enrolment(s) ${REPLAY ? 'to replay' : 'without a workspace'}${DRY_RUN ? ' (dry run)' : ''}`,
  );

  let repaired = 0;
  for (const row of rows) {
    const schoolId = row.schoolId ?? (await workspaceOf(row.userId, row.containerId));
    if (!schoolId) {
      console.log(`  – ${row.userId} → ${row.containerId}: no workspace, left as is`);
      continue;
    }

    // The history in order, so the projection ends in the state the row is actually in:
    // "created" says the learner holds the course, and only what followed changes that.
    const events = [
      outboxRow('learning.enrollment.created', row.enrolledAt, {
        enrollmentId: row.id,
        userId: row.userId,
        containerId: row.containerId,
        schoolId,
      }),
    ];
    if (row.status === 'COMPLETED' && row.completedAt) {
      events.push(
        outboxRow('learning.enrollment.completed', row.completedAt, {
          enrollmentId: row.id,
          userId: row.userId,
          containerId: row.containerId,
          schoolId,
          completedAt: row.completedAt.toISOString(),
        }),
      );
    }
    if (row.status === 'UNENROLLED' && row.unenrolledAt) {
      events.push(
        outboxRow('learning.enrollment.unenrolled', row.unenrolledAt, {
          enrollmentId: row.id,
          userId: row.userId,
          containerId: row.containerId,
          reason: row.unenrollReason,
        }),
      );
    }

    console.log(
      `  ✓ ${row.userId} → ${row.containerId} (${row.status}) → workspace ${schoolId}, ${events.length} event(s)`,
    );
    repaired++;

    if (DRY_RUN) continue;

    await prisma.$transaction(async (tx) => {
      await tx.enrollment.update({ where: { id: row.id }, data: { schoolId } });
      for (const event of events) await tx.outbox.create({ data: event });
    });
  }

  console.log(`${repaired} repaired, ${rows.length - repaired} left without a workspace`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
