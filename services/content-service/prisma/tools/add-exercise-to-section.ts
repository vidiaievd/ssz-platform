/**
 * Puts one authored exercise into a module section, without reseeding the course.
 *
 * The problem this solves is visible in the Norsk B1 dev database and nowhere in the
 * code: a module carries several versions, and three different readers look at three
 * different ones.
 *
 * - `seed-norsk-b1.ts` owns exactly two of them forever, because it derives their ids
 *   from the module key (`module-version:1A`, `module-version-draft:1A`).
 * - The **web structure editor** edits the newest *draft*. That is the list an author is
 *   looking at, and the one a publish turns into the next version.
 * - A **student** reads the newest *published* version, which after any publishing from
 *   the builder has an id the seed has never heard of.
 *
 * In the Norsk B1 dev database those have drifted apart: the draft is still the seed's
 * v2 with nine exercises, while v4 is published with twelve. So "add an exercise to
 * leksjon 1A" has to say *which* list it means — and for anything an author is meant to
 * see and then publish, the answer is the draft.
 *
 * The exercise itself is written the way the seed writes it — same uuidv5 ids, so a later
 * `npx tsx prisma/seed-norsk-b1.ts` updates the row rather than creating a second copy
 * beside it. Only the placement is version-specific, and everything else in the versions
 * it touches is left alone: they hold work done in the web builder that no seed can
 * reproduce.
 *
 * `--version` picks the list: `draft` (default), `published`, or `both`.
 * Dry run by default; `--yes` writes. Idempotent — a second run repositions rather than
 * duplicating.
 *
 *   npx tsx prisma/tools/add-exercise-to-section.ts --key b1-1a-ss-01 --unit 1A --after b1-1a-order-01
 *   npx tsx prisma/tools/add-exercise-to-section.ts --key b1-1a-ss-01 --unit 1A --after b1-1a-order-01 --version both --yes
 *
 * Only the `norsk-b1` course is wired up: the A2 seed uses its own namespace, and
 * guessing at it would be the one mistake this tool exists to prevent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { v5 as uuidv5 } from 'uuid';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

/** Must match `seed-norsk-b1.ts` exactly — that is what makes a reseed an update. */
const NAMESPACE = '9c4e7f2a-1d6b-5e8c-a3f0-2b7c1d9e4a60';
const id = (kind: string, key: string): string => uuidv5(`${kind}:${key}`, NAMESPACE);

const TEACHER_ID = '0b2f2404-854a-4ea5-9d33-816db353983f';
const SCHOOL_ID = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const TARGET_LANG = 'nb';
const EXPLANATION_LANG = 'ru';
const LEVEL = 'B1' as const;
const VISIBILITY = 'SCHOOL_PRIVATE' as const;

interface ExerciseDef {
  key: string;
  template: string;
  instruction: string;
  hint?: string;
  content: unknown;
  expectedAnswers: unknown;
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

async function main(): Promise<void> {
  const key = arg('key');
  const unit = arg('unit');
  const sectionTitle = arg('section') ?? 'Øvelser';
  const after = arg('after');
  const which = arg('version') ?? 'draft';
  const write = process.argv.includes('--yes');

  if (!key || !unit) {
    console.error(
      'Usage: --key <exercise key> --unit <module key, e.g. 1A> [--section Øvelser] [--after <exercise key>] [--version draft|published|both] [--yes]',
    );
    process.exit(1);
  }
  if (!['draft', 'published', 'both'].includes(which)) {
    console.error('✗ --version must be draft, published or both.');
    process.exit(1);
  }

  const file = join(process.cwd(), 'prisma', 'data', 'norsk-b1', 'exercises.json');
  const authored = JSON.parse(readFileSync(file, 'utf8')) as Record<string, ExerciseDef[]>;
  const ex = (authored[unit] ?? []).find((e) => e.key === key);
  if (!ex) {
    console.error(`✗ ${key} is not in exercises.json under "${unit}" — author it there first.`);
    process.exit(1);
  }

  const template = await prisma.exerciseTemplate.findFirst({ where: { code: ex.template } });
  if (!template) {
    console.error(`✗ no exercise template with code "${ex.template}" — run the base seed.`);
    process.exit(1);
  }

  const containerId = id('module-container', unit);
  // The enum member name, not its `@map` value: Prisma matches on `DRAFT`/`PUBLISHED`,
  // and the lowercase form the column stores is refused at the client, not at the
  // database — so the mistake surfaces as a validation error, never as an empty result.
  const newest = (status: 'DRAFT' | 'PUBLISHED') =>
    prisma.containerVersion.findFirst({
      where: { containerId, status },
      orderBy: { versionNumber: 'desc' },
    });

  const targets: { id: string; versionNumber: number; status: string }[] = [];
  if (which === 'draft' || which === 'both') {
    const draft = await newest('DRAFT');
    if (!draft) {
      console.error(`✗ module "${unit}" has no draft — that is the version the editor shows.`);
      process.exit(1);
    }
    targets.push(draft);
  }
  if (which === 'published' || which === 'both') {
    const published = await newest('PUBLISHED');
    if (!published) {
      console.error(`✗ module "${unit}" has no published version.`);
      process.exit(1);
    }
    targets.push(published);
  }

  const exerciseId = id('exercise', ex.key);

  console.log('course   norsk-b1');
  console.log(`unit     ${unit} → container ${containerId}`);
  console.log(`exercise ${ex.key} (${ex.template}) → ${exerciseId}`);

  if (write) {
    await upsertExercise(ex, exerciseId, template.id);
    console.log('✓ exercise row and instruction written');
  }

  for (const version of targets) {
    await place(version, ex, exerciseId, sectionTitle, after, write);
  }

  if (!write) console.log('\nDry run. Re-run with --yes to write.');
}

/** The exercise itself — identical to what `seedExercise` in the course seed writes. */
async function upsertExercise(ex: ExerciseDef, exerciseId: string, templateId: string) {
  await prisma.exercise.upsert({
    where: { id: exerciseId },
    update: {
      exerciseTemplateId: templateId,
      content: ex.content as never,
      expectedAnswers: ex.expectedAnswers as never,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
    },
    create: {
      id: exerciseId,
      exerciseTemplateId: templateId,
      targetLanguage: TARGET_LANG,
      difficultyLevel: LEVEL,
      content: ex.content as never,
      expectedAnswers: ex.expectedAnswers as never,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      estimatedDurationSeconds: 60,
    },
  });

  const instructionId = id('exercise-instruction', ex.key);
  await prisma.exerciseInstruction.upsert({
    where: { id: instructionId },
    update: { instructionText: ex.instruction, hintText: ex.hint ?? null },
    create: {
      id: instructionId,
      exerciseId,
      instructionLanguage: EXPLANATION_LANG,
      instructionText: ex.instruction,
      hintText: ex.hint ?? null,
    },
  });
}

/** One container item, in one version's section. */
async function place(
  version: { id: string; versionNumber: number; status: string },
  ex: ExerciseDef,
  exerciseId: string,
  sectionTitle: string,
  after: string | undefined,
  write: boolean,
): Promise<void> {
  const label = `v${version.versionNumber} (${version.status})`;

  const section = await prisma.containerSection.findFirst({
    where: { containerVersionId: version.id, title: sectionTitle },
  });
  if (!section) {
    console.error(`✗ ${label} has no section titled "${sectionTitle}" — skipped.`);
    return;
  }

  /*
    Is this exercise already in this list?

    Asked about the **exercise reference**, never about the id this tool would mint. A
    version published from the builder is a *copy* of the one before it, and the copy
    carries every item under a fresh random id — so a check by derived id says "not here"
    about a list the exercise is plainly already in, and files a second copy of it. That
    happened once, in v5 of leksjon 1A, and the only visible symptom was the same task
    twice in the practice page.
  */
  const already = await prisma.containerItem.findFirst({
    where: { containerVersionId: version.id, itemId: exerciseId },
  });
  const itemId = already?.id ?? id('container-item', `${version.id}:EXERCISE:${exerciseId}`);

  // Where it lands. `--after` puts it directly behind a sibling, which is how an author
  // means "next to the drill it belongs with"; without it the item goes to the end.
  let position: number;
  let shiftFrom: number | null = null;
  if (after !== undefined) {
    const anchor = await prisma.containerItem.findFirst({
      where: { containerVersionId: version.id, itemId: id('exercise', after) },
    });
    if (anchor) {
      position = anchor.position + 1;
      shiftFrom = position;
    } else {
      // Not a reason to stop: the versions have diverged, and an anchor that exists in
      // one list may simply not be in the other. Appending is the honest fallback.
      const last = await lastPosition(version.id);
      position = last + 1;
      console.log(`  ${label}: "${after}" not in this version — appending instead`);
    }
  } else {
    position = (await lastPosition(version.id)) + 1;
  }

  console.log(
    `  ${label}: section ${section.id} → position ${position}${already ? ' (already filed, repositioning)' : ''}`,
  );

  if (!write) return;

  await prisma.$transaction(async (tx) => {
    if (shiftFrom !== null && !already) {
      // Two hops, out of the way and back. `(version, position)` is unique and not
      // deferred, so a single `position + 1` collides with the row above it the moment
      // the update walks upward.
      await tx.containerItem.updateMany({
        where: { containerVersionId: version.id, position: { gte: shiftFrom } },
        data: { position: { increment: 1000 } },
      });
      await tx.containerItem.updateMany({
        where: { containerVersionId: version.id, position: { gte: 1000 } },
        data: { position: { decrement: 999 } },
      });
    }

    await tx.containerItem.upsert({
      where: { id: itemId },
      update: { position, sectionId: section.id },
      create: {
        id: itemId,
        containerVersionId: version.id,
        position,
        itemType: 'EXERCISE',
        itemId: exerciseId,
        sectionId: section.id,
      },
    });

    await tx.containerVersion.update({
      where: { id: version.id },
      data: { revisionCount: { increment: 1 } },
    });
  });

  console.log(`  ${label}: ✓ written`);
}

async function lastPosition(versionId: string): Promise<number> {
  const last = await prisma.containerItem.findFirst({
    where: { containerVersionId: versionId },
    orderBy: { position: 'desc' },
  });
  return last?.position ?? -1;
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
