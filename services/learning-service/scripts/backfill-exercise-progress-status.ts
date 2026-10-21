// One-off backfill: recompute exercise progress from the engine's attempts (plan 76, 2.6).
//
// Until 2.6 the web reader and VoxOrd posted `completed: true` for every exercise they
// checked — failed by the machine, or handed to a teacher — and the consumer marked any
// scored attempt complete whether it passed or not. So `user_progress` holds exercises
// marked done that were never passed, and work waiting for a teacher written as done or
// as in progress, where it is now `SUBMITTED`.
//
// The rule is the one the consumer follows from now on (Q2-A):
//   - any passed attempt                         → COMPLETED (dated by the first one)
//   - otherwise, the latest finished attempt is
//     waiting for a teacher                      → SUBMITTED
//   - otherwise                                  → IN_PROGRESS (tried, not passed)
// `NEEDS_REVIEW` is a teacher's flag and is left alone; so are counters and the score.
//
// The attempts live in exercise-engine's database, and the engine has no internal read
// for them; this script reads that database directly and READ-ONLY (`ENGINE_DATABASE_URL`).
// A one-off repair may cross the line a service may not.
//
// Each changed row is re-announced as `learning.progress.updated` through the outbox so
// analytics' `item_progress` follows. Dated a second after the row's own last write: the
// projection keeps the newest state, and a date of today would read as activity today.
// Safe to run more than once: only rows whose status differs from the rule are touched.
//
// Run (compiles first — ts-node's ESM loader cannot resolve the generated client):
//   npm run backfill:exercise-progress-status -- [flags]
// Flags:
//   --dry-run       report what would be written, write nothing
//   --user=<uuid>   just this learner's rows
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const EXCHANGE = 'learning.events';
const SOURCE = 'learning-service';

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_USER = process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length);

const DATABASE_URL = process.env.DATABASE_URL;
const ENGINE_DATABASE_URL = process.env.ENGINE_DATABASE_URL;

type Status = 'IN_PROGRESS' | 'SUBMITTED' | 'COMPLETED';

interface AttemptRow {
  user_id: string;
  exercise_id: string;
  status: string;
  passed: boolean | null;
  template_code: string;
  finished_at: Date;
}

interface Verdict {
  status: Status;
  completedAt: Date | null;
  why: string;
}

/** The rule above, over one learner's finished attempts at one exercise, oldest first. */
function verdictOf(attempts: AttemptRow[]): Verdict {
  const firstPass = attempts.find((a) => a.status === 'scored' && a.passed === true);
  if (firstPass) return { status: 'COMPLETED', completedAt: firstPass.finished_at, why: 'passed' };

  const latest = attempts[attempts.length - 1];
  if (latest?.status === 'routed_for_review') {
    return { status: 'SUBMITTED', completedAt: null, why: `${latest.template_code} with a teacher` };
  }
  if (latest === undefined) return { status: 'IN_PROGRESS', completedAt: null, why: 'no finished attempt' };
  return { status: 'IN_PROGRESS', completedAt: null, why: `${latest.template_code}, latest ${latest.status}, never passed` };
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
  for (const [name, value] of Object.entries({ DATABASE_URL, ENGINE_DATABASE_URL })) {
    if (!value) throw new Error(`${name} is not set`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL! }) });
  const engine = new pg.Client({ connectionString: ENGINE_DATABASE_URL });
  await engine.connect();

  const rows = await prisma.userProgress.findMany({
    where: {
      contentType: 'EXERCISE',
      status: { not: 'NEEDS_REVIEW' },
      ...(ONLY_USER ? { userId: ONLY_USER } : {}),
    },
  });

  // Finished attempts only: an open one says nothing yet, an abandoned one never will.
  const { rows: attempts } = await engine.query<AttemptRow>(
    `SELECT user_id, exercise_id, status, passed, template_code,
            COALESCE(scored_at, submitted_at, started_at) AS finished_at
       FROM attempts
      WHERE status IN ('scored', 'routed_for_review', 'returned')
        AND user_id = ANY($1::text[])
      ORDER BY finished_at ASC`,
    [[...new Set(rows.map((r) => r.userId))]],
  );
  await engine.end();

  const byKey = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const key = `${a.user_id}:${a.exercise_id}`;
    const list = byKey.get(key) ?? [];
    list.push(a);
    byKey.set(key, list);
  }

  console.log(`${rows.length} exercise progress row(s)${DRY_RUN ? ' (dry run)' : ''}`);

  const tally = new Map<string, number>();
  let changed = 0;
  for (const row of rows) {
    const verdict = verdictOf(byKey.get(`${row.userId}:${row.contentId}`) ?? []);
    if (verdict.status === row.status) continue;

    const move = `${row.status} → ${verdict.status}`;
    tally.set(move, (tally.get(move) ?? 0) + 1);
    console.log(`  ✓ ${row.userId} · ${row.contentId}: ${move} (${verdict.why})`);
    changed++;

    if (DRY_RUN) continue;

    const at = new Date(row.updatedAt.getTime() + 1000);
    await prisma.$transaction(async (tx) => {
      await tx.userProgress.update({
        where: { id: row.id },
        data: { status: verdict.status, completedAt: verdict.completedAt },
      });
      await tx.outbox.create({
        data: outboxRow('learning.progress.updated', at, {
          userId: row.userId,
          contentType: 'EXERCISE',
          contentId: row.contentId,
          status: verdict.status,
          attemptsCount: row.attemptsCount,
          score: row.score,
        }),
      });
    });
  }

  for (const [move, count] of tally) console.log(`  ${count} × ${move}`);
  console.log(`${changed} changed, ${rows.length - changed} already right`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
