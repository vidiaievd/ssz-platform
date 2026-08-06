/**
 * Cuts the Norsk B1 course down to the exercises of a few units, so that debugging a
 * template happens against a lesson's worth of content instead of the whole course.
 *
 * Only exercises are removed. Lessons, vocabulary, grammar rules and the container
 * structure stay, so the course still opens and reads normally — the practice sections
 * of the untouched units simply become empty.
 *
 * Reversible, and that is the only reason this is safe to run: nothing here writes to
 * `prisma/data/norsk-b1/exercises.json`, so everything removed comes back with
 *
 *   npx tsx prisma/seed-norsk-b1.ts
 *
 * Exercises are deleted outright rather than soft-deleted, precisely because of that:
 * the seed upserts by id and does not clear `deleted_at`, so a soft delete would be the
 * one thing a reseed could *not* undo.
 *
 * Dry run by default; `--yes` performs the deletion.
 *
 *   npx tsx prisma/tools/trim-to-lesson.ts
 *   npx tsx prisma/tools/trim-to-lesson.ts --units 1,1A,1B,1C --yes
 *
 * Dangling references across services. Databases are per service and there is no
 * cascade between them, so deleted exercises leave rows behind in `learning_db`
 * (SRS cards, progress, submissions) and `exercises_db` (attempts) pointing at nothing.
 * In development that is noise rather than breakage, but it is not something to leave
 * unsaid — the tool counts those rows and prints them. It needs read access to say so:
 * set `LEARNING_DATABASE_URL` and `EXERCISES_DATABASE_URL` (the values in each
 * service's own `.env`), or the count is reported as unknown.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { v5 as uuidv5 } from 'uuid';

// Same namespace and key scheme as seed-norsk-b1.ts — the ids have to be the ones the
// seed writes, or this would delete nothing and say so with confidence.
const NAMESPACE = '9c4e7f2a-1d6b-5e8c-a3f0-2b7c1d9e4a60';
const id = (kind: string, key: string): string => uuidv5(`${kind}:${key}`, NAMESPACE);

const DATA_FILE = join(process.cwd(), 'prisma', 'data', 'norsk-b1', 'exercises.json');
const DEFAULT_UNITS = ['1', '1A', '1B', '1C'];

interface ExerciseDef {
  key: string;
  template: string;
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const apply = process.argv.includes('--yes');
const units = (arg('units') ?? DEFAULT_UNITS.join(','))
  .split(',')
  .map((unit) => unit.trim())
  .filter(Boolean);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

/**
 * Rows in another service's database that would point at nothing. `null` means the
 * database was not reachable — an unknown count, which is not the same as none.
 */
async function countElsewhere(
  url: string | undefined,
  ids: string[],
  queries: { label: string; sql: string }[],
): Promise<{ label: string; count: number | null }[]> {
  if (!url) return queries.map((query) => ({ label: query.label, count: null }));

  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const counted: { label: string; count: number | null }[] = [];
    for (const query of queries) {
      // Raw SQL because this client's schema is content-service's; the tables below
      // belong to another service and Prisma has no models for them here.
      const rows = await client.$queryRawUnsafe<{ count: bigint }[]>(query.sql, ids);
      counted.push({ label: query.label, count: Number(rows[0]?.count ?? 0) });
    }
    return counted;
  } catch (error) {
    console.warn(`  ⚠ could not read ${url.replace(/:[^:@]*@/, ':***@')}: ${String(error)}`);
    return queries.map((query) => ({ label: query.label, count: null }));
  } finally {
    await client.$disconnect();
  }
}

async function main(): Promise<void> {
  const byUnit = JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as Record<string, ExerciseDef[]>;

  const unknown = units.filter((unit) => byUnit[unit] === undefined);
  if (unknown.length > 0) {
    console.error(`✗ no such unit in exercises.json: ${unknown.join(', ')}`);
    process.exit(1);
  }

  const keep: string[] = [];
  const drop: string[] = [];
  for (const [unit, exercises] of Object.entries(byUnit)) {
    for (const exercise of exercises) {
      (units.includes(unit) ? keep : drop).push(exercise.key);
    }
  }

  const dropIds = drop.map((key) => id('exercise', key));

  // What is actually in the database, which is not the same as what the file lists: a
  // course trimmed once and never reseeded has fewer rows than keys.
  const present = await prisma.exercise.findMany({
    where: { id: { in: dropIds } },
    select: { id: true },
  });
  const presentIds = present.map((row) => row.id);

  const items = await prisma.containerItem.count({
    where: { itemType: 'EXERCISE', itemId: { in: presentIds } },
  });
  const poolEntries = await prisma.grammarRuleExercisePool.count({
    where: { exerciseId: { in: presentIds } },
  });

  console.log(`Norsk B1 — keeping units ${units.join(', ')}`);
  console.log(`  keep:   ${keep.length} exercises in exercises.json`);
  console.log(`  delete: ${presentIds.length} exercise rows (${drop.length} keys outside those units)`);
  console.log(`          ${items} container items, ${poolEntries} grammar pool entries (cascade)`);

  console.log('\nLeft pointing at nothing, in other services:');
  const orphans = [
    ...(await countElsewhere(process.env.LEARNING_DATABASE_URL, presentIds, [
      {
        label: 'learning_db.srs_review_cards',
        sql: `SELECT count(*)::bigint AS count FROM srs_review_cards
              WHERE content_type = 'exercise' AND content_id = ANY($1::text[])`,
      },
      {
        label: 'learning_db.user_progress',
        sql: `SELECT count(*)::bigint AS count FROM user_progress
              WHERE content_type = 'exercise' AND content_id = ANY($1::text[])`,
      },
      {
        label: 'learning_db.submissions',
        sql: `SELECT count(*)::bigint AS count FROM submissions
              WHERE exercise_id = ANY($1::text[])`,
      },
    ])),
    ...(await countElsewhere(process.env.EXERCISES_DATABASE_URL, presentIds, [
      {
        label: 'exercises_db.attempts',
        sql: `SELECT count(*)::bigint AS count FROM attempts
              WHERE exercise_id = ANY($1::text[])`,
      },
    ])),
  ];
  for (const { label, count } of orphans) {
    console.log(`  ${label}: ${count === null ? 'unknown — database URL not set' : count}`);
  }

  if (!apply) {
    console.log('\nDry run. Nothing was changed. Re-run with --yes to delete.');
    return;
  }

  // Container items first: the reference is polymorphic (`item_type` + `item_id`), so
  // no foreign key would take them with the exercise.
  const removedItems = await prisma.containerItem.deleteMany({
    where: { itemType: 'EXERCISE', itemId: { in: presentIds } },
  });
  const removed = await prisma.exercise.deleteMany({ where: { id: { in: presentIds } } });

  console.log(`\n✓ deleted ${removed.count} exercises and ${removedItems.count} container items`);
  console.log('  Restore with: npx tsx prisma/seed-norsk-b1.ts');
}

main()
  .catch((error) => {
    console.error('Trim failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
