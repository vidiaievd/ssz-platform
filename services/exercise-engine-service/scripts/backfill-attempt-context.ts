// One-off backfill: give existing submissions the school, course, group and path that
// attempts only started snapshotting in plan 44 §44.4. Without it the oversight screen
// and the teacher's queue are empty on the day they ship — everything already handed in
// carries no school, and a queue filtered by school cannot show it.
//
// Idempotent and restartable: it only ever fills columns that are null, so a second run
// touches nothing a first run settled, and an interrupted run resumes by simply being
// started again.
//
// Run (compiles first — ts-node's ESM loader cannot resolve the generated client):
//   npm run backfill:attempt-context -- [flags]
// Flags:
//   --dry-run        resolve and report, write nothing
//   --batch=200      rows per batch (default 200)
//   --pause-ms=250   pause between batches, to leave the neighbours some air
//   --days=90        how far back to go for already-decided submissions
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const CONTENT_BASE_URL = process.env['CONTENT_SERVICE_BASE_URL'];
const ORGANIZATION_BASE_URL = process.env['ORGANIZATION_SERVICE_BASE_URL'];
const INTERNAL_TOKEN = process.env['INTERNAL_SERVICE_TOKEN'];

interface Placement {
  containerId: string | null;
  containerTitle: string | null;
  moduleId: string | null;
  moduleTitle: string | null;
  exerciseTitle: string | null;
  ownerSchoolId: string | null;
}

interface AttemptRow {
  id: string;
  userId: string;
  exerciseId: string;
  schoolId: string | null;
  containerId: string | null;
  groupId: string | null;
  exercisePath: unknown;
}

export interface ContextPatch {
  schoolId?: string;
  containerId?: string;
  groupId?: string;
  exercisePath?: { course: string | null; module: string | null; exercise: string | null };
}

/**
 * What this row is still missing, of what the neighbours could tell us.
 *
 * Only blanks are filled. A value snapshotted when the learner started describes where
 * they were *then*, and a backfill running months later has no business overwriting it
 * with where they are now — the same rule `Attempt.backfillReviewContext` already keeps.
 */
export function contextPatch(
  row: Pick<AttemptRow, 'schoolId' | 'containerId' | 'groupId' | 'exercisePath'>,
  placement: Placement | null,
  groupId: string | null,
): ContextPatch {
  const patch: ContextPatch = {};
  if (placement === null) return patch;

  if (row.schoolId === null && placement.ownerSchoolId !== null) {
    patch.schoolId = placement.ownerSchoolId;
  }
  if (row.containerId === null && placement.containerId !== null) {
    patch.containerId = placement.containerId;
  }
  if (row.exercisePath === null) {
    patch.exercisePath = {
      course: placement.containerTitle,
      module: placement.moduleTitle,
      exercise: placement.exerciseTitle,
    };
  }
  if (row.groupId === null && groupId !== null) {
    patch.groupId = groupId;
  }

  return patch;
}

interface PhaseReport {
  phase: string;
  scanned: number;
  updated: number;
  schoolFilled: number;
  groupFilled: number;
  noPlacement: number;
  noGroup: number;
  failed: number;
}

function flag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number.parseInt(raw.slice(name.length + 3), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = flag('batch', 200);
const PAUSE_MS = flag('pause-ms', 250);
const DAYS = flag('days', 90);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Placements are per exercise, and a queue is many submissions of few exercises. */
const placements = new Map<string, Placement | null>();

async function getPlacement(exerciseId: string): Promise<Placement | null> {
  const cached = placements.get(exerciseId);
  if (cached !== undefined) return cached;

  let placement: Placement | null = null;
  try {
    const res = await fetch(
      `${CONTENT_BASE_URL}/api/v1/internal/exercises/${exerciseId}/placement`,
      { headers: { 'x-internal-token': INTERNAL_TOKEN ?? '' } },
    );
    placement = res.ok ? ((await res.json()) as Placement) : null;
  } catch (err) {
    console.warn(`  placement lookup failed for ${exerciseId}: ${describe(err)}`);
  }

  placements.set(exerciseId, placement);
  return placement;
}

/**
 * The learner's group *now*, not on the day they handed the work in.
 *
 * organization-service can answer as of a date, but only from the memberships it still
 * holds — a learner moved between groups since leaves no trace to resolve against. So a
 * mover is filed under their current group, which the report says out loud: it is a known
 * limit of backfilled history, not a bug to hunt later.
 */
async function getGroupId(
  schoolId: string,
  userId: string,
  courseId: string | null,
): Promise<string | null> {
  const query = courseId ? `?courseId=${courseId}` : '';
  try {
    const res = await fetch(
      `${ORGANIZATION_BASE_URL}/api/v1/internal/schools/${schoolId}/students/${userId}/group${query}`,
      { headers: { 'x-internal-token': INTERNAL_TOKEN ?? '' } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { groupId: string | null };
    return body.groupId;
  } catch (err) {
    console.warn(`  group lookup failed for ${userId}: ${describe(err)}`);
    return null;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runPhase(
  prisma: PrismaClient,
  phase: string,
  where: Record<string, unknown>,
): Promise<PhaseReport> {
  const report: PhaseReport = {
    phase,
    scanned: 0,
    updated: 0,
    schoolFilled: 0,
    groupFilled: 0,
    noPlacement: 0,
    noGroup: 0,
    failed: 0,
  };

  // Keyset by id rather than skip/take: rows leave the filter as they are filled, and an
  // offset would step over the ones that shifted into its place.
  let after: string | null = null;

  for (;;) {
    const rows: AttemptRow[] = await prisma.attempt.findMany({
      where: { ...where, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: {
        id: true,
        userId: true,
        exerciseId: true,
        schoolId: true,
        containerId: true,
        groupId: true,
        exercisePath: true,
      },
    });

    if (rows.length === 0) break;
    after = rows[rows.length - 1]!.id;
    report.scanned += rows.length;

    for (const row of rows) {
      try {
        const placement = await getPlacement(row.exerciseId);
        if (placement === null) {
          report.noPlacement += 1;
          continue;
        }

        const schoolId = row.schoolId ?? placement.ownerSchoolId;
        const groupId =
          row.groupId === null && schoolId !== null
            ? await getGroupId(schoolId, row.userId, row.containerId ?? placement.containerId)
            : row.groupId;

        if (schoolId !== null && groupId === null) report.noGroup += 1;

        const patch = contextPatch(row, placement, groupId);
        if (Object.keys(patch).length === 0) continue;

        if (!DRY_RUN) {
          await prisma.attempt.update({ where: { id: row.id }, data: patch });
        }

        report.updated += 1;
        if (patch.schoolId) report.schoolFilled += 1;
        if (patch.groupId) report.groupFilled += 1;
      } catch (err) {
        report.failed += 1;
        console.warn(`  attempt ${row.id} failed: ${describe(err)}`);
      }
    }

    console.log(
      `  [${phase}] ${report.scanned} scanned, ${report.updated} updated, ` +
        `${report.noPlacement} without a placement`,
    );
    await sleep(PAUSE_MS);
  }

  return report;
}

async function main(): Promise<void> {
  for (const [name, value] of Object.entries({
    CONTENT_SERVICE_BASE_URL: CONTENT_BASE_URL,
    ORGANIZATION_SERVICE_BASE_URL: ORGANIZATION_BASE_URL,
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
  })) {
    if (!value) throw new Error(`${name} is required`);
  }

  const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] as string });
  const prisma = new PrismaClient({ adapter });
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  console.log(
    `Backfilling attempt context — batch ${BATCH}, pause ${PAUSE_MS}ms, ` +
      `${DAYS} days of history${DRY_RUN ? ', DRY RUN' : ''}`,
  );

  try {
    const reports: PhaseReport[] = [];

    // Waiting work first: it is what the queue shows *today*, and a teacher opening an
    // empty inbox on release day is the failure this whole step exists to prevent.
    reports.push(
      await runPhase(prisma, 'routed_for_review', {
        status: 'ROUTED_FOR_REVIEW',
        schoolId: null,
      }),
    );

    // Then the decided ones, for the journal and the durations behind the medians. Bounded
    // by `--days`: older history moves no figure anybody reads.
    reports.push(
      await runPhase(prisma, `decided_last_${DAYS}d`, {
        status: { in: ['SCORED', 'RETURNED'] },
        schoolId: null,
        submittedAt: { gte: since },
      }),
    );

    console.log('\nReport');
    for (const report of reports) {
      console.log(
        `  ${report.phase}: scanned ${report.scanned}, updated ${report.updated}, ` +
          `school filled ${report.schoolFilled}, group filled ${report.groupFilled}, ` +
          `no placement ${report.noPlacement}, no group ${report.noGroup}, failed ${report.failed}`,
      );
    }

    const pendingLeft = await prisma.attempt.count({
      where: { status: 'ROUTED_FOR_REVIEW', schoolId: null },
    });
    console.log(`  submissions still waiting without a school: ${pendingLeft}`);
    console.log(
      '  note: a learner who changed group since handing in is filed under their current ' +
        'group — history to resolve against no longer exists.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run as a script. The patch rule above is unit-tested, and importing this
// file to test it must not start a backfill.
if (isEntryPoint()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}
