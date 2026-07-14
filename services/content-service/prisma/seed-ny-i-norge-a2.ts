/**
 * Seed — Norwegian A2 course «Ny i Norge», lessons 17–18.
 *
 * Builds a frontend-ready COURSE container owned by the demo school. The course
 * mirrors the textbook: each Leksjon (17, 18) is a ContainerSection that groups
 *   • LESSON          — reading texts (17B/17C/17D, 18A–18D) from data/.../lessons
 *   • VOCABULARY_LIST — word lists from data/.../vocab.json, with full form
 *                       paradigms (grammaticalProperties): verbs by tense,
 *                       nouns by number/definiteness, adjectives by gender/number
 *   • GRAMMAR_RULE    — grammar explanation (data/.../grammar) at the END of the
 *                       Leksjon, as requested
 *   • EXERCISES       — tasks built from the grammar rule (data/.../exercises.json),
 *                       also wired into the grammar rule practice pool
 *
 * Content is authored from the source files in docs/ny_i_norge (textbook.odt,
 * ord_list.docx, 17_/18_Grammatikk.pdf) and stored under prisma/data/ny-i-norge-a2.
 *
 * Idempotent: ids are derived deterministically (uuid v5) and all writes upsert,
 * so re-running updates existing rows instead of duplicating them.
 *
 * Run from services/content-service:
 *   npx tsx prisma/seed-ny-i-norge-a2.ts
 *
 * Requires the exercise templates from prisma/seed.ts to be seeded first.
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

// ─── Deterministic id helper ────────────────────────────────────────────────
const NAMESPACE = '7a2c9d1e-3b4f-5c6d-8e7f-0a1b2c3d4e5f'; // distinct from demo seed
const id = (kind: string, key: string): string => uuidv5(`${kind}:${key}`, NAMESPACE);

// Same demo actors as seed-demo-norwegian.ts so the course sits in the same school.
const TEACHER_ID = '0b2f2404-854a-4ea5-9d33-816db353983f';
const SCHOOL_ID = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';

const TARGET_LANG = 'nb'; // Norwegian Bokmål
const EXPLANATION_LANG = 'ru';
const LEVEL = 'A2' as const;
const VISIBILITY = 'SCHOOL_PRIVATE' as const;
const ACCESS_TIER = 'FREE_WITHIN_SCHOOL' as const;

// Resolved from the working directory — this script is meant to be run from
// services/content-service (see the header), matching the other seed scripts.
const DATA_DIR = join(process.cwd(), 'prisma', 'data', 'ny-i-norge-a2');

// ─── Source data types ──────────────────────────────────────────────────────
interface VocabWord {
  word: string;
  partOfSpeech: string;
  translation: string;
  grammaticalProperties?: Record<string, unknown>;
}
interface VocabSection {
  title: string;
  words: VocabWord[];
}
interface ExerciseDef {
  key: string;
  template: string;
  instruction: string;
  hint?: string;
  content: Prisma.InputJsonValue;
  expectedAnswers: Prisma.InputJsonValue;
}

const vocab: Record<string, VocabSection> = JSON.parse(
  readFileSync(join(DATA_DIR, 'vocab.json'), 'utf-8'),
);
const exercises: Record<string, ExerciseDef[]> = JSON.parse(
  readFileSync(join(DATA_DIR, 'exercises.json'), 'utf-8'),
);
const lessonBody = (key: string): string =>
  readFileSync(join(DATA_DIR, 'lessons', `${key}.md`), 'utf-8');
const grammarBody = (key: string): string =>
  readFileSync(join(DATA_DIR, 'grammar', `${key}.md`), 'utf-8');

// ─── Lesson & grammar metadata ──────────────────────────────────────────────
const lessonMeta: Record<string, { title: string; description: string }> = {
  '17B': { title: '17B — Hassan får kink i ryggen', description: 'Lesetekst: Hassan får vondt i ryggen og går til legen.' },
  '17C': { title: '17C — Maria danser', description: 'Brev: en mørk vinter og et energikick fra dans.' },
  '17D': { title: '17D — Helse i Norge', description: 'Fagtekst: fastlege, legevakt, helsestasjon og tannlege.' },
  '18A': { title: '18A — Konfirmant neste år?', description: 'Dialog: kirkelig og humanistisk konfirmasjon.' },
  '18B': { title: '18B — Et julebesøk', description: 'Dialog: hva skal familien spise i julen?' },
  '18C': { title: '18C — Planer for påsken', description: 'Dialog: påskeplaner – fjellet, Oslo og hytta.' },
  '18D': { title: '18D — Høytider i Norge', description: 'Fagtekst: jul, påske og 17. mai.' },
  '19A': { title: '19A — Anne skriver et leserinnlegg', description: 'Dialog + leserinnlegg om en ny svømmehall i kommunen.' },
  '19B': { title: '19B — Hvordan kommer jeg i kontakt med nordmenn?', description: 'Samtale om å bli kjent med nordmenn og sosiale medier.' },
  '19C': { title: '19C — Noen kjente nordmenn', description: 'Fagtekst: Brundtland, Heyerdahl, Grete Waitz og a-ha.' },
};

const grammarMeta: Record<
  string,
  { title: string; topic: string; subtopic: string; summary: string }
> = {
  '17': {
    title: 'Subjunksjoner og ordstilling',
    topic: 'CONJUNCTIONS',
    subtopic: 'Subjunksjoner / ordstilling',
    summary: 'Подчинительные союзы и порядок слов в придаточных предложениях (инверсия при вынесении придаточного вперёд).',
  },
  '18': {
    title: 'Fordi/derfor, selv om/likevel, når/da',
    topic: 'CONJUNCTIONS',
    subtopic: 'Subjunksjon vs. adverb',
    summary: 'Разница между подчинительным союзом и наречием, инверсия в главном предложении; когда «da», а когда «når».',
  },
};

// ─── Course layout: sections → ordered items ────────────────────────────────
type Item =
  | { kind: 'lesson'; key: string }
  | { kind: 'vocab'; key: string }
  | { kind: 'grammar'; key: string }
  | { kind: 'exercises'; key: string };

interface Section {
  key: string;
  title: string;
  items: Item[];
}

const sections: Section[] = [
  {
    key: 'lek17',
    title: 'Leksjon 17 — Helse',
    items: [
      { kind: 'lesson', key: '17B' },
      { kind: 'lesson', key: '17C' },
      { kind: 'vocab', key: '17C' },
      { kind: 'lesson', key: '17D' },
      { kind: 'vocab', key: '17D' },
      { kind: 'vocab', key: '17T' },
      { kind: 'vocab', key: '17G' },
      { kind: 'grammar', key: '17' },
      { kind: 'exercises', key: '17' },
    ],
  },
  {
    key: 'lek18',
    title: 'Leksjon 18 — Høytider og tradisjoner',
    items: [
      { kind: 'vocab', key: '18I' },
      { kind: 'lesson', key: '18A' },
      { kind: 'vocab', key: '18A' },
      { kind: 'lesson', key: '18B' },
      { kind: 'vocab', key: '18B' },
      { kind: 'vocab', key: '18M' },
      { kind: 'lesson', key: '18C' },
      { kind: 'vocab', key: '18C' },
      { kind: 'lesson', key: '18D' },
      { kind: 'vocab', key: '18D' },
      { kind: 'vocab', key: '18G' },
      { kind: 'grammar', key: '18' },
      { kind: 'exercises', key: '18' },
    ],
  },
  {
    key: 'lek19',
    title: 'Leksjon 19 — Medier og kultur',
    items: [
      { kind: 'lesson', key: '19A' },
      { kind: 'vocab', key: '19A' },
      { kind: 'lesson', key: '19B' },
      { kind: 'vocab', key: '19B' },
      { kind: 'lesson', key: '19C' },
      { kind: 'vocab', key: '19C' },
      { kind: 'vocab', key: '19D' },
      { kind: 'vocab', key: '19M' },
      // No grammar rule for leksjon 19 (no source PDF) — vocabulary exercises only.
      { kind: 'exercises', key: '19' },
    ],
  },
];

// ─── Seeding logic ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('Seeding «Ny i Norge — A2» (leksjon 17–18)…');

  const templateCodes = ['multiple_choice', 'fill_in_blank', 'translate_to_target', 'match_pairs'];
  const templates = await prisma.exerciseTemplate.findMany({ where: { code: { in: templateCodes } } });
  const templateByCode = new Map(templates.map((t) => [t.code, t.id]));
  const missing = templateCodes.filter((c) => !templateByCode.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Missing exercise templates: ${missing.join(', ')}. Run "npm run prisma:seed" first.`,
    );
  }

  // 1. Course container + published version.
  const containerId = id('container', 'ny-i-norge-a2');
  const versionId = id('version', 'ny-i-norge-a2-v1');
  const courseTitle = 'Ny i Norge — A2';
  const courseDescription =
    'Kurs i norsk på A2-nivå etter læreboka «Ny i Norge». Leksjon 17 (helse) og ' +
    'leksjon 18 (høytider og tradisjoner) med lesetekster, ordforråd med fullstendige ' +
    'ordformer, grammatikk og øvelser. Flere leksjoner kommer etter hvert.';

  await prisma.container.upsert({
    where: { id: containerId },
    update: {
      title: courseTitle,
      description: courseDescription,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
      currentPublishedVersionId: versionId,
    },
    create: {
      id: containerId,
      slug: 'ny-i-norge-a2',
      containerType: 'COURSE',
      targetLanguage: TARGET_LANG,
      difficultyLevel: LEVEL,
      title: courseTitle,
      description: courseDescription,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
    },
  });

  await prisma.containerVersion.upsert({
    where: { id: versionId },
    update: { status: 'PUBLISHED' },
    create: {
      id: versionId,
      containerId,
      versionNumber: 1,
      status: 'PUBLISHED',
      changelog: 'Leksjon 17–18.',
      createdByUserId: TEACHER_ID,
      publishedAt: new Date(),
      publishedByUserId: TEACHER_ID,
    },
  });
  await prisma.container.update({
    where: { id: containerId },
    data: { currentPublishedVersionId: versionId },
  });
  console.log('  ✓ Course container + published version');

  let itemPosition = 0;

  for (const [sectionIndex, section] of sections.entries()) {
    const sectionId = id('section', section.key);
    await prisma.containerSection.upsert({
      where: { id: sectionId },
      update: { title: section.title },
      create: {
        id: sectionId,
        containerVersionId: versionId,
        title: section.title,
        position: sectionIndex,
      },
    });

    for (const item of section.items) {
      if (item.kind === 'lesson') {
        await seedLesson(item.key);
        await upsertItem(versionId, sectionId, itemPosition++, 'LESSON', id('lesson', item.key));
      } else if (item.kind === 'vocab') {
        await seedVocab(item.key);
        await upsertItem(versionId, sectionId, itemPosition++, 'VOCABULARY_LIST', id('vocab', item.key));
      } else if (item.kind === 'grammar') {
        await seedGrammar(item.key);
        await upsertItem(versionId, sectionId, itemPosition++, 'GRAMMAR_RULE', id('grammar', item.key));
      } else {
        // exercises: seed each and add as items. Wire into the grammar rule
        // practice pool only when the Leksjon has a grammar rule (17, 18).
        const hasGrammarRule = grammarMeta[item.key] !== undefined;
        const grammarId = id('grammar', item.key);
        for (const [exIndex, ex] of exercises[item.key].entries()) {
          await seedExercise(ex, templateByCode.get(ex.template)!);
          if (hasGrammarRule) {
            const poolId = id('grammar-pool', ex.key);
            await prisma.grammarRuleExercisePool.upsert({
              where: { id: poolId },
              update: { position: exIndex },
              create: {
                id: poolId,
                grammarRuleId: grammarId,
                exerciseId: id('exercise', ex.key),
                position: exIndex,
                addedByUserId: TEACHER_ID,
              },
            });
          }
          await upsertItem(versionId, sectionId, itemPosition++, 'EXERCISE', id('exercise', ex.key));
        }
      }
    }
    console.log(`  ✓ ${section.title}`);
  }

  console.log('Done.');
}

async function seedLesson(key: string): Promise<void> {
  const meta = lessonMeta[key];
  const lessonId = id('lesson', key);
  await prisma.lesson.upsert({
    where: { id: lessonId },
    update: { title: meta.title, description: meta.description, ownerUserId: TEACHER_ID, ownerSchoolId: SCHOOL_ID, visibility: VISIBILITY },
    create: {
      id: lessonId,
      targetLanguage: TARGET_LANG,
      difficultyLevel: LEVEL,
      slug: `ny-i-norge-a2-${key.toLowerCase()}`,
      title: meta.title,
      description: meta.description,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
    },
  });
  const variantId = id('lesson-variant', key);
  const body = lessonBody(key);
  await prisma.lessonContentVariant.upsert({
    where: { id: variantId },
    update: { bodyMarkdown: body, displayTitle: meta.title, displayDescription: meta.description, status: 'PUBLISHED' },
    create: {
      id: variantId,
      lessonId,
      explanationLanguage: EXPLANATION_LANG,
      minLevel: LEVEL,
      maxLevel: LEVEL,
      displayTitle: meta.title,
      displayDescription: meta.description,
      bodyMarkdown: body,
      estimatedReadingMinutes: 6,
      status: 'PUBLISHED',
      createdByUserId: TEACHER_ID,
      lastEditedByUserId: TEACHER_ID,
      publishedAt: new Date(),
    },
  });
}

async function seedVocab(key: string): Promise<void> {
  const section = vocab[key];
  const listId = id('vocab', key);
  await prisma.vocabularyList.upsert({
    where: { id: listId },
    update: { title: section.title, ownerUserId: TEACHER_ID, ownerSchoolId: SCHOOL_ID, visibility: VISIBILITY },
    create: {
      id: listId,
      slug: `ny-i-norge-a2-${key.toLowerCase()}-ordforraad`,
      title: section.title,
      description: `Ordforråd til ${section.title}.`,
      targetLanguage: TARGET_LANG,
      difficultyLevel: LEVEL,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
    },
  });
  for (const [i, w] of section.words.entries()) {
    const itemId = id('vocab-item', `${key}-${i}`);
    await prisma.vocabularyItem.upsert({
      where: { id: itemId },
      update: {
        word: w.word,
        position: i,
        partOfSpeech: w.partOfSpeech as never,
        grammaticalProperties: (w.grammaticalProperties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
      create: {
        id: itemId,
        vocabularyListId: listId,
        word: w.word,
        position: i,
        partOfSpeech: w.partOfSpeech as never,
        grammaticalProperties: (w.grammaticalProperties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
    const translationId = id('vocab-translation', `${key}-${i}`);
    await prisma.vocabularyItemTranslation.upsert({
      where: { id: translationId },
      update: { primaryTranslation: w.translation, lastEditedByUserId: TEACHER_ID },
      create: {
        id: translationId,
        vocabularyItemId: itemId,
        translationLanguage: EXPLANATION_LANG,
        primaryTranslation: w.translation,
        createdByUserId: TEACHER_ID,
        lastEditedByUserId: TEACHER_ID,
      },
    });
  }
}

async function seedGrammar(key: string): Promise<void> {
  const meta = grammarMeta[key];
  const grammarId = id('grammar', key);
  await prisma.grammarRule.upsert({
    where: { id: grammarId },
    update: { title: meta.title, subtopic: meta.subtopic, ownerUserId: TEACHER_ID, ownerSchoolId: SCHOOL_ID, visibility: VISIBILITY },
    create: {
      id: grammarId,
      slug: `ny-i-norge-a2-leksjon-${key}-grammatikk`,
      targetLanguage: TARGET_LANG,
      difficultyLevel: LEVEL,
      topic: meta.topic as never,
      subtopic: meta.subtopic,
      title: meta.title,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
    },
  });
  const explanationId = id('grammar-explanation', key);
  const body = grammarBody(key);
  await prisma.grammarRuleExplanation.upsert({
    where: { id: explanationId },
    update: { bodyMarkdown: body, displayTitle: meta.title, displaySummary: meta.summary, status: 'PUBLISHED' },
    create: {
      id: explanationId,
      grammarRuleId: grammarId,
      explanationLanguage: EXPLANATION_LANG,
      minLevel: LEVEL,
      maxLevel: LEVEL,
      displayTitle: meta.title,
      displaySummary: meta.summary,
      bodyMarkdown: body,
      estimatedReadingMinutes: 6,
      status: 'PUBLISHED',
      createdByUserId: TEACHER_ID,
      lastEditedByUserId: TEACHER_ID,
      publishedAt: new Date(),
    },
  });
}

async function seedExercise(ex: ExerciseDef, templateId: string): Promise<void> {
  const exerciseId = id('exercise', ex.key);
  await prisma.exercise.upsert({
    where: { id: exerciseId },
    update: { content: ex.content, expectedAnswers: ex.expectedAnswers, ownerUserId: TEACHER_ID, ownerSchoolId: SCHOOL_ID, visibility: VISIBILITY },
    create: {
      id: exerciseId,
      exerciseTemplateId: templateId,
      targetLanguage: TARGET_LANG,
      difficultyLevel: LEVEL,
      content: ex.content,
      expectedAnswers: ex.expectedAnswers,
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

async function upsertItem(
  versionId: string,
  sectionId: string,
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
