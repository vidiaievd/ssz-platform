/**
 * Seed — Norwegian A2 course «Ny i Norge», leksjon 17–19.
 *
 * Builds a frontend-ready COURSE container owned by the demo school, structured
 * for the redesigned course-reader (plan 29 / design_handoff_course_reader):
 *
 *   COURSE (levelSystem = CEFR)
 *     └─ Level section per Leksjon (e.g. "Leksjon 19 — Medier og kultur")
 *        └─ MODULE container per sub-lesson/text (e.g. "19B — Kontakt…")  ←
 *        │                               CONTAINER-type ContainerItem
 *        ├─ Section "Nye ord"   (New words)   — vocabulary list(s) for that text
 *        ├─ Section "Tekst"     (Read)        — the reading lesson
 *        └─ Section "Øvelser"   (Practice)    — reinforcement exercises
 *
 * Each *text* is its own sub-lesson MODULE, grouping its new words → text →
 * exercises. The curriculum tree is fixed at three grouping levels and only
 * treats CONTAINER items at the COURSE top level as modules
 * (get-curriculum-tree.handler.ts), so we map Leksjon → Level, sub-lesson →
 * Module, {Nye ord / Tekst / Øvelser} → Sections. Vocab lists with no single
 * home text (grammar-term/intro/topic lists) attach to the nearest sub-lesson
 * or the closing "Grammatikk og øvelser" module.
 *
 * Every container gets BOTH a PUBLISHED version (v1) and a DRAFT version (v2)
 * with identical structure. The authoring UI's structure tree always reads the
 * DRAFT version (content/[id]/page.tsx resolves versions.find(status=draft)),
 * while students / "Published" state read the published version — so a
 * published-only seed renders "Could not load the curriculum tree".
 *
 * Vocabulary comes first inside every module: the reader makes the vocabulary
 * screen the unit entry point ("the unit now starts here").
 *
 * Content is authored from the source files in docs/ny_i_norge (textbook.odt,
 * ord_list.docx, 17_/18_Grammatikk.pdf) and stored under prisma/data/ny-i-norge-a2.
 *
 * Idempotent: ids are derived deterministically (uuid v5) and all writes upsert.
 * The course/module version item+section lists are wiped and rebuilt on every run
 * so structural changes (e.g. the flat→module migration) apply cleanly.
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

// ─── Course layout: Level (Leksjon) → Module (sub-lesson) → Section → items ──
// The curriculum tree is fixed at three grouping levels
// (Level → Module → Section → leaf Item) and only treats CONTAINER items at the
// COURSE top level as modules (get-curriculum-tree.handler.ts). To express the
// "sub-lesson" grouping (each text with its own new words → text → exercises)
// we map: Leksjon = course Level (ContainerSection), sub-lesson/text = MODULE,
// and {Nye ord / Tekst / Øvelser} = the module's Sections.
type Item =
  | { kind: 'lesson'; key: string }
  | { kind: 'vocab'; key: string }
  | { kind: 'grammar'; key: string }
  | { kind: 'exercises'; key: string };

interface ModuleSection {
  key: string; // unique within the module
  title: string;
  items: Item[];
}

// A sub-lesson: a MODULE container grouping one text's material.
interface ModuleDef {
  key: string; // e.g. '19A' — globally unique (module-container id namespace)
  title: string; // Norwegian module title
  titleEn: string; // English localization (curriculum tree titleEn)
  description: string;
  sections: ModuleSection[];
}

// A Leksjon: a course Level (ContainerSection) holding sub-lesson modules.
interface LevelDef {
  key: string; // 'lek19' — course-level section id namespace
  title: string; // Norwegian level title, e.g. 'Leksjon 19 — Medier og kultur'
  subLessons: ModuleDef[];
}

const SEC_VOCAB = 'Nye ord';
const SEC_TEXTS = 'Tekst';
const SEC_GRAMMAR = 'Grammatikk';
const SEC_PRACTICE = 'Øvelser';

// Section helpers keep the sub-lesson definitions terse.
const vocabSec = (...keys: string[]): ModuleSection => ({
  key: 'nyeord',
  title: SEC_VOCAB,
  items: keys.map((key) => ({ kind: 'vocab', key })),
});
const textSec = (key: string): ModuleSection => ({
  key: 'tekst',
  title: SEC_TEXTS,
  items: [{ kind: 'lesson', key }],
});
const practiceSec = (key: string): ModuleSection => ({
  key: 'ovelser',
  title: SEC_PRACTICE,
  items: [{ kind: 'exercises', key }],
});

// Each Leksjon becomes a course Level; every text becomes a sub-lesson MODULE
// with Nye ord → Tekst → Øvelser sections. Vocab lists that don't belong to a
// single text (grammar-term / intro / topic-expression lists, suffixes G/I/T/M)
// are attached to the nearest thematic sub-lesson or the closing practice
// module. Only leksjon 19 has authored reinforcement exercises (Arbeidsbok);
// 17/18 keep their grammar-practice pool under a "Grammatikk og øvelser" module.
const levels: LevelDef[] = [
  {
    key: 'lek17',
    title: 'Leksjon 17 — Helse',
    subLessons: [
      {
        key: '17B',
        title: '17B — Hassan får kink i ryggen',
        titleEn: '17B — Hassan hurts his back',
        description: 'Lesetekst: Hassan får vondt i ryggen og går til legen.',
        sections: [textSec('17B')],
      },
      {
        key: '17C',
        title: '17C — Maria danser',
        titleEn: '17C — Maria dances',
        description: 'Brev: en mørk vinter og et energikick fra dans.',
        sections: [vocabSec('17C'), textSec('17C')],
      },
      {
        key: '17D',
        title: '17D — Helse i Norge',
        titleEn: '17D — Health in Norway',
        description: 'Fagtekst: fastlege, legevakt, helsestasjon og tannlege.',
        sections: [vocabSec('17D', '17T'), textSec('17D')],
      },
      {
        key: '17-ov',
        title: '17 — Grammatikk og øvelser',
        titleEn: '17 — Grammar and practice',
        description: 'Subjunksjoner og ordstilling, med øvelser.',
        sections: [
          { key: 'grammatikk', title: SEC_GRAMMAR, items: [{ kind: 'grammar', key: '17' }] },
          vocabSec('17G'),
          practiceSec('17'),
        ],
      },
    ],
  },
  {
    key: 'lek18',
    title: 'Leksjon 18 — Høytider og tradisjoner',
    subLessons: [
      {
        key: '18A',
        title: '18A — Konfirmant neste år?',
        titleEn: '18A — Confirmand next year?',
        description: 'Dialog: kirkelig og humanistisk konfirmasjon.',
        sections: [vocabSec('18I', '18A'), textSec('18A')],
      },
      {
        key: '18B',
        title: '18B — Et julebesøk',
        titleEn: '18B — A Christmas visit',
        description: 'Dialog: hva skal familien spise i julen?',
        sections: [vocabSec('18B', '18M'), textSec('18B')],
      },
      {
        key: '18C',
        title: '18C — Planer for påsken',
        titleEn: '18C — Easter plans',
        description: 'Dialog: påskeplaner – fjellet, Oslo og hytta.',
        sections: [vocabSec('18C'), textSec('18C')],
      },
      {
        key: '18D',
        title: '18D — Høytider i Norge',
        titleEn: '18D — Holidays in Norway',
        description: 'Fagtekst: jul, påske og 17. mai.',
        sections: [vocabSec('18D'), textSec('18D')],
      },
      {
        key: '18-ov',
        title: '18 — Grammatikk og øvelser',
        titleEn: '18 — Grammar and practice',
        description: 'Fordi/derfor, selv om/likevel, når/da, med øvelser.',
        sections: [
          { key: 'grammatikk', title: SEC_GRAMMAR, items: [{ kind: 'grammar', key: '18' }] },
          vocabSec('18G'),
          practiceSec('18'),
        ],
      },
    ],
  },
  {
    key: 'lek19',
    title: 'Leksjon 19 — Medier og kultur',
    subLessons: [
      {
        key: '19A',
        title: '19A — Anne skriver et leserinnlegg',
        titleEn: '19A — Anne writes a reader letter',
        description: 'Dialog + leserinnlegg om en ny svømmehall i kommunen.',
        sections: [vocabSec('19A'), textSec('19A'), practiceSec('19A')],
      },
      {
        key: '19B',
        title: '19B — Kontakt med nordmenn',
        titleEn: '19B — Getting in touch with Norwegians',
        description: 'Samtale om å bli kjent med nordmenn, høflighet og sosiale medier.',
        sections: [vocabSec('19B', '19D'), textSec('19B'), practiceSec('19B')],
      },
      {
        key: '19C',
        title: '19C — Noen kjente nordmenn',
        titleEn: '19C — Some famous Norwegians',
        description: 'Fagtekst: Brundtland, Heyerdahl, Grete Waitz og a-ha.',
        sections: [vocabSec('19C', '19M'), textSec('19C'), practiceSec('19C')],
      },
      {
        key: '19-ov',
        title: '19 — Øvelser (hele leksjonen)',
        titleEn: '19 — Practice (whole lesson)',
        description: 'Setningsskjema (hel- og leddsetninger) og skriveoppgaver.',
        sections: [practiceSec('19-felles')],
      },
    ],
  },
];

// Flat list of every sub-lesson module, in course order — seeded before the
// course wires them as CONTAINER items under their Leksjon level.
const modules: ModuleDef[] = levels.flatMap((l) => l.subLessons);

// ─── Seeding logic ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('Seeding «Ny i Norge — A2» (leksjon 17–19, module structure)…');

  const templateCodes = [
    'multiple_choice',
    'fill_in_blank',
    'translate_to_target',
    'match_pairs',
    'short_answer',
    'writing_task',
    'sentence_schema',
  ];
  const templates = await prisma.exerciseTemplate.findMany({ where: { code: { in: templateCodes } } });
  const templateByCode = new Map(templates.map((t) => [t.code, t.id]));
  const missing = templateCodes.filter((c) => !templateByCode.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Missing exercise templates: ${missing.join(', ')}. Run "npm run prisma:seed" first.`,
    );
  }

  // 1. Course container + published(v1)/draft(v2) versions. levelSystem CEFR,
  // but the authoring curriculum UI is level-based (levels = ContainerSections
  // on the course; modules attach under a level). We repurpose each level as a
  // Leksjon, so the course reads Course → Leksjon (level) → sub-lesson (module)
  // → Nye ord / Tekst / Øvelser (sections).
  const courseId = id('container', 'ny-i-norge-a2');
  const coursePubVersionId = id('version', 'ny-i-norge-a2-v1');
  const courseDraftVersionId = id('version', 'ny-i-norge-a2-draft');
  const courseTitle = 'Ny i Norge — A2';
  const courseDescription =
    'Kurs i norsk på A2-nivå etter læreboka «Ny i Norge». Leksjon 17 (helse), ' +
    'leksjon 18 (høytider og tradisjoner) og leksjon 19 (medier og kultur), hver med ' +
    'lesetekster, ordforråd med fullstendige ordformer, grammatikk og øvelser. ' +
    'Flere leksjoner kommer etter hvert.';

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
      levelSystem: 'CEFR',
    },
  });

  await ensureVersions(courseId, coursePubVersionId, courseDraftVersionId, 'Leksjon 17–19 (modulstruktur).');
  console.log('  ✓ Course container + published/draft versions');

  // 2. One MODULE container per sub-lesson (each with its own published + draft
  // versions and the leaf items). Seed these BEFORE wiring the course items so
  // the CONTAINER references are never dangling.
  for (const mod of modules) {
    await seedModule(mod, templateByCode);
    console.log(`  ✓ ${mod.title}`);
  }

  // 3. Rebuild BOTH course versions: one level section per Leksjon, each holding
  // its sub-lesson module CONTAINER items. Wiped and recreated each run so
  // stray/manual level sections on the draft are cleaned up and the structure
  // stays idempotent. ContainerItem.position is unique per version (across all
  // sections), so module positions run continuously through the whole course.
  for (const versionId of [coursePubVersionId, courseDraftVersionId]) {
    await prisma.containerItem.deleteMany({ where: { containerVersionId: versionId } });
    await prisma.containerSection.deleteMany({ where: { containerVersionId: versionId } });
    let modulePosition = 0;
    for (const [levelIndex, level] of levels.entries()) {
      const levelSectionId = id('course-level', `${versionId}:${level.key}`);
      await prisma.containerSection.create({
        data: {
          id: levelSectionId,
          containerVersionId: versionId,
          title: level.title,
          position: levelIndex,
        },
      });
      for (const sub of level.subLessons) {
        await upsertItem(versionId, levelSectionId, modulePosition++, 'CONTAINER', id('module-container', sub.key));
      }
    }
  }

  console.log('Done.');
}

// Every container keeps exactly one PUBLISHED (v1) and one DRAFT (v2) version.
// Authoring reads the draft; students / "Published" state read the published one.
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

async function seedModule(
  mod: ModuleDef,
  templateByCode: Map<string, string>,
): Promise<void> {
  const moduleContainerId = id('module-container', mod.key);
  const modulePubVersionId = id('module-version', mod.key);
  const moduleDraftVersionId = id('module-version-draft', mod.key);

  await prisma.container.upsert({
    where: { id: moduleContainerId },
    update: {
      title: mod.title,
      description: mod.description,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
      currentPublishedVersionId: modulePubVersionId,
    },
    create: {
      id: moduleContainerId,
      containerType: 'MODULE',
      targetLanguage: TARGET_LANG,
      difficultyLevel: LEVEL,
      title: mod.title,
      description: mod.description,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
    },
  });

  await ensureVersions(moduleContainerId, modulePubVersionId, moduleDraftVersionId, 'Initial modulinnhold.');

  // English localization (curriculum tree reads titleEn from the 'en' localization).
  await prisma.containerLocalization.upsert({
    where: { containerId_languageCode: { containerId: moduleContainerId, languageCode: 'en' } },
    update: { title: mod.titleEn, description: mod.description },
    create: {
      containerId: moduleContainerId,
      languageCode: 'en',
      title: mod.titleEn,
      description: mod.description,
      createdByUserId: TEACHER_ID,
    },
  });

  // Populate BOTH module versions with the same sections + items.
  for (const versionId of [modulePubVersionId, moduleDraftVersionId]) {
    await populateModuleVersion(versionId, mod, templateByCode);
  }
}

// Rebuilds a module version's sections + item list from scratch (idempotent).
// Section and container-item ids are namespaced by versionId so the published
// and draft versions never collide. Leaf entities (lessons/vocab/…) are shared
// and upserted; re-seeding them per version is harmless.
async function populateModuleVersion(
  versionId: string,
  mod: ModuleDef,
  templateByCode: Map<string, string>,
): Promise<void> {
  await prisma.containerItem.deleteMany({ where: { containerVersionId: versionId } });
  await prisma.containerSection.deleteMany({ where: { containerVersionId: versionId } });

  // ContainerItem.position is unique per version (across all sections), so item
  // positions run continuously through the module in section order.
  let itemPosition = 0;

  for (const [sectionIndex, section] of mod.sections.entries()) {
    const sectionId = id('module-section', `${versionId}:${section.key}`);
    await prisma.containerSection.create({
      data: {
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
  }
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

// Container items are recreated on every run (the version's item list is wiped
// first), so a deterministic id keeps re-runs stable. sectionId groups the item
// under a level (course) or a named section (module); null = ungrouped.
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
