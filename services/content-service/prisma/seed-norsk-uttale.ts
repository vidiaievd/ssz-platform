/**
 * Seed — «Norsk uttale», the pronunciation course A1 → B1 (plan 86, step 12.2).
 *
 *   COURSE (levelSystem = CEFR, nb)
 *     └─ Level section per CEFR level (A1, A2, B1)
 *        └─ MODULE per lesson (31): Lytt (lesson, variants ru + uk) → Øvelser (exercises)
 *
 * Lessons are self-contained and may be taken in any order (owner's decision 05.11), so there is
 * no gating and no grammar module. The data is generated from the written course into
 * prisma/data/norsk-uttale/ (see its README) and checked by prisma/tools/check-norsk-uttale.ts;
 * this file only writes it.
 *
 * Exercises: `read_aloud` (read — the machine's reading check with the sound analysis; dialogue —
 * the teacher) and `minimal_pairs`. Each names its sound atoms as `SOUND` targets, which is what
 * the SRS and the analytics read (plan 86, step 8). A `minimal_pairs` is placed in its module only
 * once every word has a clip (step 12.3): without them the engine cannot deal a probe, and the
 * row exists so that the clips have somewhere to go.
 *
 * Idempotent: ids are uuid v5 in a namespace of their own; writes upsert, version item/section
 * lists are rebuilt on every run, and the targets of a seeded exercise are the data's, nothing else.
 *
 * Run from services/content-service:
 *   npx tsx prisma/seed-norsk-uttale.ts
 *
 * Requires the exercise templates from prisma/seed.ts and the sound atoms from
 * prisma/seed-sound-atoms.ts.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { v5 as uuidv5 } from 'uuid';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

// Distinct namespace from the other course seeds so the courses never share ids.
const NAMESPACE = '9e4c1a7b-3d58-4f2e-a6b1-7c0d2e8f5a93';
const id = (kind: string, key: string): string => uuidv5(`${kind}:${key}`, NAMESPACE);

// Same demo actors as the other course seeds.
const TEACHER_ID = '0b2f2404-854a-4ea5-9d33-816db353983f';
const SCHOOL_ID = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';

const TARGET_LANG = 'nb';
const LOCALES = ['ru', 'uk'] as const; // Q23: the lesson body in Russian and Ukrainian
// The course has its instructions in Norwegian only; the envelope falls back to it.
const INSTRUCTION_LANG = 'nb';
const VISIBILITY = 'SCHOOL_PRIVATE' as const;
const ACCESS_TIER = 'FREE_WITHIN_SCHOOL' as const;

type Level = 'A1' | 'A2' | 'B1';

const DATA_DIR = join(process.cwd(), 'prisma', 'data', 'norsk-uttale');

interface LessonMeta {
  key: string;
  num: number;
  level: Level;
  title: string;
  sound: string;
  atoms: string[];
}
interface ExerciseDef {
  key: string;
  template: 'read_aloud' | 'minimal_pairs';
  instruction: string;
  content: Prisma.InputJsonValue & { pairs?: { words: { clip?: { assetId?: string } }[] }[] };
  expectedAnswers: Prisma.InputJsonValue;
  targets: string[];
}

const course = JSON.parse(readFileSync(join(DATA_DIR, 'course.json'), 'utf-8')) as { lessons: LessonMeta[] };
const exercises = JSON.parse(readFileSync(join(DATA_DIR, 'exercises.json'), 'utf-8')) as Record<
  string,
  ExerciseDef[]
>;
const body = (key: string, locale: string): string =>
  readFileSync(join(DATA_DIR, 'lessons', `${key}.${locale}.md`), 'utf-8');

const LEVELS: { level: Level; title: string }[] = [
  { level: 'A1', title: 'A1 — Lyder og ord' },
  { level: 'A2', title: 'A2 — Fraser og tonemer' },
  { level: 'B1', title: 'B1 — Flytende tale' },
];

const SEC_LYTT = 'Lytt';
const SEC_PRACTICE = 'Øvelser';

// Seconds a learner spends on one exercise, for the course home's estimate: a prompt is
// listened to, recorded and replayed; a pair set is a dozen probes.
const durationOf = (ex: ExerciseDef): number =>
  ex.template === 'read_aloud'
    ? 60 * ((ex.content as { prompts?: unknown[] }).prompts?.length ?? 1)
    : 120;

/** Every word of the set has a clip — the only state in which the engine can deal a probe. */
const hasClips = (ex: ExerciseDef): boolean =>
  (ex.content.pairs ?? []).every((p) => p.words.every((w) => !!w.clip?.assetId));

async function main(): Promise<void> {
  console.log(`Seeding «Norsk uttale» (${course.lessons.length} lessons)…`);

  const usedCodes = [...new Set(Object.values(exercises).flat().map((e) => e.template))];
  const templates = await prisma.exerciseTemplate.findMany({ where: { code: { in: usedCodes } } });
  const templateByCode = new Map(templates.map((t) => [t.code, t.id]));
  const missing = usedCodes.filter((c) => !templateByCode.has(c));
  if (missing.length > 0) {
    throw new Error(`Missing exercise templates: ${missing.join(', ')}. Run "npm run prisma:seed" first.`);
  }

  // A target names a sound atom by its natural key and carries no FK: an atom the catalogue does
  // not hold would be a broken target read as "nothing to train", so refuse it here instead.
  const usedAtoms = [...new Set(Object.values(exercises).flat().flatMap((e) => e.targets))];
  const known = new Set(
    (await prisma.soundAtom.findMany({ where: { id: { in: usedAtoms } }, select: { id: true } })).map((a) => a.id),
  );
  const unknownAtoms = usedAtoms.filter((a) => !known.has(a));
  if (unknownAtoms.length > 0) {
    throw new Error(
      `Sound atoms missing from the catalogue: ${unknownAtoms.join(', ')}. Run "npx tsx prisma/seed-sound-atoms.ts" first.`,
    );
  }

  const courseId = id('container', 'norsk-uttale');
  const coursePubVersionId = id('version', 'norsk-uttale-v1');
  const courseDraftVersionId = id('version', 'norsk-uttale-draft');
  const courseTitle = 'Norsk uttale';
  const courseDescription =
    'Uttale fra A1 til B1: lange og korte vokaler, trykk, y, u, ø og æ, kj og sj, r og retroflekser, ' +
    'tonemer og setningsmelodi. Hver leksjon er én lyd: hør forskjellen, si ord og fraser, regler og ' +
    'tekster — med stemmeanalyse og en ny runde der det trengs. Leksjonene kan tas i hvilken som helst rekkefølge.';

  await prisma.container.upsert({
    where: { id: courseId },
    update: {
      title: courseTitle,
      description: courseDescription,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
      levelSystem: 'CEFR',
      currentPublishedVersionId: coursePubVersionId,
    },
    create: {
      id: courseId,
      slug: 'norsk-uttale',
      containerType: 'COURSE',
      targetLanguage: TARGET_LANG,
      difficultyLevel: 'A1',
      title: courseTitle,
      description: courseDescription,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
      levelSystem: 'CEFR',
    },
  });
  await ensureVersions(courseId, coursePubVersionId, courseDraftVersionId, 'Leksjon 1–31.');
  console.log('  ✓ Course container + published/draft versions');

  let placed = 0;
  let held = 0;
  let targetTotal = 0;
  for (const lesson of course.lessons) {
    const r = await seedModule(lesson, templateByCode);
    placed += r.placed;
    held += r.held;
    targetTotal += r.targets;
    console.log(`  ✓ ${lesson.key} — ${lesson.title} (${r.placed} exercises${r.held ? `, ${r.held} held` : ''})`);
  }

  // Both course versions: one section per level holding its lesson modules.
  for (const versionId of [coursePubVersionId, courseDraftVersionId]) {
    await prisma.containerItem.deleteMany({ where: { containerVersionId: versionId } });
    await prisma.containerSection.deleteMany({ where: { containerVersionId: versionId } });
    let position = 0;
    for (const [levelIndex, l] of LEVELS.entries()) {
      const sectionId = id('course-level', `${versionId}:${l.level}`);
      await prisma.containerSection.create({
        data: { id: sectionId, containerVersionId: versionId, title: l.title, position: levelIndex },
      });
      for (const lesson of course.lessons.filter((x) => x.level === l.level)) {
        await upsertItem(versionId, sectionId, position++, 'CONTAINER', id('module-container', lesson.key));
      }
    }
  }

  console.log(
    `  ✓ ${placed} exercises in modules, ${held} minimal_pairs held until their clips exist (step 12.3), ` +
      `${targetTotal} sound targets`,
  );
  console.log('Done.');
}

// Every container keeps exactly one PUBLISHED (v1) and one DRAFT (v2) version.
async function ensureVersions(
  containerId: string,
  pubVersionId: string,
  draftVersionId: string,
  changelog: string,
): Promise<void> {
  await prisma.containerVersion.upsert({
    where: { id: pubVersionId },
    update: { status: 'PUBLISHED' },
    create: {
      id: pubVersionId,
      containerId,
      versionNumber: 1,
      status: 'PUBLISHED',
      changelog,
      createdByUserId: TEACHER_ID,
      publishedAt: new Date(),
      publishedByUserId: TEACHER_ID,
    },
  });
  await prisma.containerVersion.upsert({
    where: { id: draftVersionId },
    update: { status: 'DRAFT' },
    create: {
      id: draftVersionId,
      containerId,
      versionNumber: 2,
      status: 'DRAFT',
      changelog: 'Redigerbart utkast.',
      createdByUserId: TEACHER_ID,
    },
  });
  await prisma.container.update({
    where: { id: containerId },
    data: { currentPublishedVersionId: pubVersionId },
  });
}

const moduleTitle = (l: LessonMeta): string => `${l.num} — ${l.title}`;

async function seedModule(
  lesson: LessonMeta,
  templateByCode: Map<string, string>,
): Promise<{ placed: number; held: number; targets: number }> {
  const moduleId = id('module-container', lesson.key);
  const pubId = id('module-version', lesson.key);
  const draftId = id('module-version-draft', lesson.key);
  const title = moduleTitle(lesson);
  const description = `Uttale ${lesson.level}: ${lesson.title}.`;

  await prisma.container.upsert({
    where: { id: moduleId },
    update: {
      title,
      description,
      difficultyLevel: lesson.level,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
      currentPublishedVersionId: pubId,
    },
    create: {
      id: moduleId,
      containerType: 'MODULE',
      targetLanguage: TARGET_LANG,
      difficultyLevel: lesson.level,
      title,
      description,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
    },
  });
  await ensureVersions(moduleId, pubId, draftId, 'Initial modulinnhold.');

  await seedLesson(lesson);
  const defs = exercises[lesson.key] ?? [];
  let targets = 0;
  for (const ex of defs) {
    await seedExercise(ex, lesson.level, templateByCode.get(ex.template)!);
    targets += await seedTargets(ex);
  }
  const shown = defs.filter((ex) => ex.template !== 'minimal_pairs' || hasClips(ex));

  for (const versionId of [pubId, draftId]) {
    await prisma.containerItem.deleteMany({ where: { containerVersionId: versionId } });
    await prisma.containerSection.deleteMany({ where: { containerVersionId: versionId } });
    const lyttId = id('module-section', `${versionId}:lytt`);
    await prisma.containerSection.create({
      data: { id: lyttId, containerVersionId: versionId, title: SEC_LYTT, position: 0 },
    });
    let position = 0;
    await upsertItem(versionId, lyttId, position++, 'LESSON', id('lesson', lesson.key));
    if (shown.length > 0) {
      const practiceId = id('module-section', `${versionId}:ovelser`);
      await prisma.containerSection.create({
        data: { id: practiceId, containerVersionId: versionId, title: SEC_PRACTICE, position: 1 },
      });
      for (const ex of shown) {
        await upsertItem(versionId, practiceId, position++, 'EXERCISE', id('exercise', ex.key));
      }
    }
  }
  return { placed: shown.length, held: defs.length - shown.length, targets };
}

async function seedLesson(lesson: LessonMeta): Promise<void> {
  const lessonId = id('lesson', lesson.key);
  const title = moduleTitle(lesson);
  const description = `Hvordan lyden lages, og ord, fraser og regler å øve med.`;
  await prisma.lesson.upsert({
    where: { id: lessonId },
    update: { title, description, ownerUserId: TEACHER_ID, ownerSchoolId: SCHOOL_ID, visibility: VISIBILITY },
    create: {
      id: lessonId,
      targetLanguage: TARGET_LANG,
      difficultyLevel: lesson.level,
      slug: `norsk-uttale-${lesson.key}`,
      title,
      description,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
    },
  });
  for (const locale of LOCALES) {
    const variantId = id('lesson-variant', `${lesson.key}.${locale}`);
    const bodyMarkdown = body(lesson.key, locale);
    await prisma.lessonContentVariant.upsert({
      where: { id: variantId },
      update: { bodyMarkdown, displayTitle: title, displayDescription: description, status: 'PUBLISHED' },
      create: {
        id: variantId,
        lessonId,
        explanationLanguage: locale,
        minLevel: lesson.level,
        maxLevel: lesson.level,
        displayTitle: title,
        displayDescription: description,
        bodyMarkdown,
        estimatedReadingMinutes: 5,
        status: 'PUBLISHED',
        createdByUserId: TEACHER_ID,
        lastEditedByUserId: TEACHER_ID,
        publishedAt: new Date(),
      },
    });
  }
}

async function seedExercise(ex: ExerciseDef, level: Level, templateId: string): Promise<void> {
  const exerciseId = id('exercise', ex.key);
  const content = ex.content as Prisma.InputJsonValue;
  await prisma.exercise.upsert({
    where: { id: exerciseId },
    update: {
      exerciseTemplateId: templateId,
      content,
      expectedAnswers: ex.expectedAnswers,
      difficultyLevel: level,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      estimatedDurationSeconds: durationOf(ex),
    },
    create: {
      id: exerciseId,
      exerciseTemplateId: templateId,
      targetLanguage: TARGET_LANG,
      difficultyLevel: level,
      content,
      expectedAnswers: ex.expectedAnswers,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      estimatedDurationSeconds: durationOf(ex),
    },
  });
  const instructionId = id('exercise-instruction', ex.key);
  await prisma.exerciseInstruction.upsert({
    where: { id: instructionId },
    update: { instructionText: ex.instruction, hintText: null },
    create: {
      id: instructionId,
      exerciseId,
      instructionLanguage: INSTRUCTION_LANG,
      instructionText: ex.instruction,
      hintText: null,
    },
  });
}

/**
 * The exercise's sound atoms, on the whole exercise (`item_key` null), role FOCUS. The exercise is
 * the seed's, so its targets are exactly the data's: a target dropped from a lesson goes.
 */
async function seedTargets(ex: ExerciseDef): Promise<number> {
  const exerciseId = id('exercise', ex.key);
  const kept: string[] = [];
  for (const atomId of ex.targets) {
    const targetId = id('exercise-target', `${ex.key}:${atomId}`);
    kept.push(targetId);
    await prisma.exerciseItemTarget.upsert({
      where: { id: targetId },
      update: { atomType: 'SOUND', atomId, role: 'FOCUS', itemKey: null },
      create: {
        id: targetId,
        exerciseId,
        itemKey: null,
        atomType: 'SOUND',
        atomId,
        role: 'FOCUS',
        createdByUserId: TEACHER_ID,
      },
    });
  }
  await prisma.exerciseItemTarget.deleteMany({ where: { exerciseId, id: { notIn: kept } } });
  return kept.length;
}

async function upsertItem(
  versionId: string,
  sectionId: string | null,
  position: number,
  itemType: string,
  targetId: string,
): Promise<void> {
  const itemId = id('container-item', `${versionId}:${itemType}:${targetId}`);
  await prisma.containerItem.upsert({
    where: { id: itemId },
    update: { position, sectionId },
    create: {
      id: itemId,
      containerVersionId: versionId,
      position,
      itemType: itemType as never,
      itemId: targetId,
      sectionId,
    },
  });
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
