/**
 * Seed — Norwegian B1 course «Norsk B1», leksjon 1–10 (SKELETON).
 *
 * Structural skeleton for the B1 course, mirroring seed-ny-i-norge-a2.ts:
 *
 *   COURSE (levelSystem = CEFR, difficulty B1)
 *     └─ Level section per Leksjon (e.g. "Leksjon 1 — Arbeidsliv")
 *        └─ MODULE container per sub-lesson/text (e.g. "1A — Bartek søker ny jobb")
 *        │                               CONTAINER-type ContainerItem
 *        ├─ Section "Nye ord"   (New words)   — added in the content-fill stage
 *        ├─ Section "Tekst"     (Read)        — the reading lesson
 *        └─ Section "Øvelser"   (Practice)    — added in the content-fill stage
 *     …plus a closing "Grammatikk og øvelser" module per Leksjon.
 *
 * This is the SKELETON step (plan docs/ny_i_norge/B1_kursplan.md, stage 1): it
 * wires the full 10-leksjon / 50-module tree with real Norwegian titles so the
 * course-reader renders and navigates correctly, BEFORE the content-heavy fill.
 *
 * Lesson and grammar bodies are read from prisma/data/norsk-b1/{lessons,grammar}
 * when the file exists, and fall back to a placeholder otherwise. So the skeleton
 * runs green with zero data files, and as real content is authored per leksjon
 * (from docs/ny_i_norge/B1/*) the files are picked up automatically — no seed
 * change needed. Vocabulary lists and exercises are added in later stages, when
 * their structured JSON is authored.
 *
 * Every container gets BOTH a PUBLISHED version (v1) and a DRAFT version (v2)
 * with identical structure (the authoring UI reads the draft; students read the
 * published version), exactly like the A2 seed.
 *
 * Idempotent: ids are derived deterministically (uuid v5) and all writes upsert.
 * Version item/section lists are wiped and rebuilt on every run.
 *
 * Run from services/content-service:
 *   npx tsx prisma/seed-norsk-b1.ts
 *
 * Requires the exercise templates from prisma/seed.ts to be seeded first
 * (not used by the skeleton yet, but kept for parity and the next stage).
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { v5 as uuidv5 } from 'uuid';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

// ─── Deterministic id helper ────────────────────────────────────────────────
// Distinct namespace from the A2 seed so the two courses never share ids.
const NAMESPACE = '9c4e7f2a-1d6b-5e8c-a3f0-2b7c1d9e4a60';
const id = (kind: string, key: string): string => uuidv5(`${kind}:${key}`, NAMESPACE);

// Same demo actors as the A2 seed so the course sits in the same demo school.
const TEACHER_ID = '0b2f2404-854a-4ea5-9d33-816db353983f';
const SCHOOL_ID = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';

const TARGET_LANG = 'nb'; // Norwegian Bokmål
const EXPLANATION_LANG = 'ru';
const LEVEL = 'B1' as const;
const VISIBILITY = 'SCHOOL_PRIVATE' as const;
const ACCESS_TIER = 'FREE_WITHIN_SCHOOL' as const;

const DATA_DIR = join(process.cwd(), 'prisma', 'data', 'norsk-b1');

// Lesson/grammar bodies: use the authored file when present, else a placeholder.
// This lets the skeleton run before any content file exists (stage 1) and pick
// up real content automatically as it is authored (stage 2+).
const readBody = (subdir: string, key: string, placeholderTitle: string): string => {
  const path = join(DATA_DIR, subdir, `${key}.md`);
  if (existsSync(path)) return readFileSync(path, 'utf-8');
  return `# ${placeholderTitle}\n\n*Innhold kommer snart.*\n`;
};

// ─── Structured content (vocab + exercises), authored per leksjon ────────────
// These JSON files hold only the leksjoner that have been filled in; keys absent
// from them simply don't get a "Nye ord" / "Øvelser" section (the leksjon stays
// a text/grammar skeleton until authored). Missing files → empty maps.
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

const readJson = <T>(file: string): T => {
  const path = join(DATA_DIR, file);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf-8')) as T) : ({} as T);
};
const vocab = readJson<Record<string, VocabSection>>('vocab.json');
const exercises = readJson<Record<string, ExerciseDef[]>>('exercises.json');

// Text annotations (spec 16 lesson_text_spans), keyed per text sub-lesson.
// `phrase` is matched against the lesson body with flexible whitespace, so it
// can be written as one line even where the body wraps it.
interface SpanDef {
  kind: 'grammar' | 'chunk';
  /** Grammar-rule key (`1`…`10`) for kind `grammar`; absent for `chunk`. */
  grammarKey?: string;
  phrase: string;
  /** 1-based, when the phrase occurs more than once in its paragraph. Default 1. */
  occurrence?: number;
  note?: string;
}
const spans = readJson<Record<string, SpanDef[]>>('spans.json');

// ─── Lesson & grammar metadata ──────────────────────────────────────────────
interface Meta {
  title: string;
  titleEn: string;
  description: string;
}

// One entry per text sub-lesson (A/B/C + "D — Les og lytt") across all leksjoner.
const lessonMeta: Record<string, Meta> = {
  // Leksjon 1 — Arbeidsliv
  '1A': { title: '1A — Bartek søker ny jobb', titleEn: '1A — Bartek applies for a new job', description: 'Å søke jobb: stillingsannonse, søknad og CV.' },
  '1B': { title: '1B — Jobbintervjuet', titleEn: '1B — The job interview', description: 'Dialog: et jobbintervju fra start til slutt.' },
  '1C': { title: '1C — Arbeidsmiljø i Norge', titleEn: '1C — Working life in Norway', description: 'Fagtekst: flat struktur, rettigheter og kaffepause.' },
  '1D': { title: '1D — Les og lytt: arbeidsliv', titleEn: '1D — Read and listen: working life', description: 'Korte tekster med lekseordforråd.' },
  // Leksjon 2 — Utdanning og kurs
  '2A': { title: '2A — Å ta fagbrev som voksen', titleEn: '2A — Taking a trade certificate as an adult', description: 'Portrett: fagbrev på jobb.' },
  '2B': { title: '2B — Det norske utdanningssystemet', titleEn: '2B — The Norwegian education system', description: 'Fagtekst: grunnskole, videregående og høyere utdanning.' },
  '2C': { title: '2C — På norskkurs', titleEn: '2C — At the Norwegian class', description: 'Dialog fra klasserommet.' },
  '2D': { title: '2D — Les og lytt: voksenopplæring', titleEn: '2D — Read and listen: adult education', description: 'Korte tekster med lekseordforråd.' },
  // Leksjon 3 — Bolig og økonomi
  '3A': { title: '3A — Skal vi leie eller kjøpe?', titleEn: '3A — Should we rent or buy?', description: 'Dialog om bolig og økonomi.' },
  '3B': { title: '3B — Å leie bolig i Norge', titleEn: '3B — Renting a home in Norway', description: 'Fagtekst: leiekontrakt, depositum og rettigheter.' },
  '3C': { title: '3C — Et stramt budsjett', titleEn: '3C — A tight budget', description: 'Leserinnlegg om dyrtid og budsjett.' },
  '3D': { title: '3D — Les og lytt: sparetips', titleEn: '3D — Read and listen: saving tips', description: 'Korte tekster med lekseordforråd.' },
  // Leksjon 4 — Helse og livsstil
  '4A': { title: '4A — Altfor mye å gjøre', titleEn: '4A — Far too much to do', description: 'Fortelling om stress og å ta vare på seg selv.' },
  '4B': { title: '4B — Psykisk helse', titleEn: '4B — Mental health', description: 'Fagtekst: det er lov å be om hjelp.' },
  '4C': { title: '4C — Hos fastlegen', titleEn: '4C — At the doctor', description: 'Dialog hos fastlegen.' },
  '4D': { title: '4D — Les og lytt: sunne vaner', titleEn: '4D — Read and listen: healthy habits', description: 'Korte tekster med lekseordforråd.' },
  // Leksjon 5 — Miljø og natur
  '5A': { title: '5A — Slik sorteres avfallet', titleEn: '5A — How waste is sorted', description: 'Fagtekst/instruksjon: kildesortering.' },
  '5B': { title: '5B — Klimadebatt i klassen', titleEn: '5B — Climate debate in class', description: 'Dialog om klima og miljø.' },
  '5C': { title: '5C — Friluftsliv', titleEn: '5C — Outdoor life', description: 'Fagtekst: friluftsliv og allemannsretten.' },
  '5D': { title: '5D — Les og lytt: grønne vaner', titleEn: '5D — Read and listen: green habits', description: 'Korte tekster med lekseordforråd.' },
  // Leksjon 6 — Media og teknologi
  '6A': { title: '6A — Er det sant? Om falske nyheter', titleEn: '6A — Is it true? On fake news', description: 'Fagtekst om falske nyheter og kildekritikk.' },
  '6B': { title: '6B — Skjermtid i familien', titleEn: '6B — Screen time in the family', description: 'Dialog om skjermtid og regler.' },
  '6C': { title: '6C — Nettvett', titleEn: '6C — Online safety', description: 'Fagtekst: vær smart og trygg på nett.' },
  '6D': { title: '6D — Les og lytt: digitale vaner', titleEn: '6D — Read and listen: digital habits', description: 'Korte tekster med lekseordforråd.' },
  // Leksjon 7 — Samfunn og demokrati
  '7A': { title: '7A — Å stemme ved valg', titleEn: '7A — Voting in elections', description: 'Fagtekst om demokrati og valg.' },
  '7B': { title: '7B — Dugnad', titleEn: '7B — Community work (dugnad)', description: 'Fagtekst om dugnad og frivillighet.' },
  '7C': { title: '7C — Et likestilt samfunn?', titleEn: '7C — An equal society?', description: 'Leserinnlegg/debatt om likestilling.' },
  '7D': { title: '7D — Les og lytt: å delta', titleEn: '7D — Read and listen: taking part', description: 'Korte tekster med lekseordforråd.' },
  // Leksjon 8 — Kultur og tradisjoner
  '8A': { title: '8A — Bunad eller dress?', titleEn: '8A — Bunad or suit?', description: 'Fagtekst om bunad og folkedrakt.' },
  '8B': { title: '8B — Norsk mat i endring', titleEn: '8B — Norwegian food in change', description: 'Fagtekst om matkultur før og nå.' },
  '8C': { title: '8C — Tro og livssyn i Norge', titleEn: '8C — Faith and beliefs in Norway', description: 'Fagtekst/intervju om tro og religionsfrihet.' },
  '8D': { title: '8D — Les og lytt: merkedager', titleEn: '8D — Read and listen: special days', description: 'Korte tekster med lekseordforråd.' },
  // Leksjon 9 — Norge før og nå
  '9A': { title: '9A — Fra fattigland til oljeland', titleEn: '9A — From poor country to oil nation', description: 'Fagtekst om Norges historie.' },
  '9B': { title: '9B — Fra utvandring til innvandring', titleEn: '9B — From emigration to immigration', description: 'Fagtekst om ut- og innvandring.' },
  '9C': { title: '9C — Kjente nordmenn', titleEn: '9C — Famous Norwegians', description: 'Portretter av kjente nordmenn.' },
  '9D': { title: '9D — Les og lytt: folk som forandret Norge', titleEn: '9D — Read and listen: people who changed Norway', description: 'Korte tekster med lekseordforråd.' },
  // Leksjon 10 — Framtidsplaner
  '10A': { title: '10A — Veien videre', titleEn: '10A — The road ahead', description: 'Fortelling om mål og framtidsplaner.' },
  '10B': { title: '10B — Hva vil du bli?', titleEn: '10B — What do you want to become?', description: 'Dialog/intervju med en rådgiver.' },
  '10C': { title: '10C — Klar for Norskprøven', titleEn: '10C — Ready for the Norwegian test', description: 'Fagtekst: forberedelse til Norskprøven B1.' },
  '10D': { title: '10D — Les og lytt: tre mål', titleEn: '10D — Read and listen: three goals', description: 'Korte tekster med lekseordforråd.' },
};

const grammarMeta: Record<
  string,
  { title: string; titleEn: string; topic: string; subtopic: string; summary: string }
> = {
  '1': { title: 'Indirekte tale', titleEn: 'Reported speech', topic: 'CONJUNCTIONS', subtopic: 'Indirekte tale', summary: 'Косвенная речь: at/om/вопросительное слово, порядок слов и сдвиг времён.' },
  '2': { title: 'Preteritum, perfektum, pluskvamperfektum', titleEn: 'Past tenses', topic: 'TENSES', subtopic: 'Fortidsformer', summary: 'Три прошедших времени и когда какое использовать.' },
  '3': { title: 'Futurum', titleEn: 'The future', topic: 'TENSES', subtopic: 'Framtid', summary: 'Способы выражения будущего: skal / vil / kommer til å / presens.' },
  '4': { title: 'Modalverb og vaner', titleEn: 'Modal verbs and habits', topic: 'VERBS', subtopic: 'Modalverb', summary: 'Модальные глаголы, их прошедшие формы, «skulle/burde ha», pleie å.' },
  '5': { title: 'Passiv', titleEn: 'The passive', topic: 'VOICE', subtopic: 'Passiv', summary: 'bli-пассив и s-пассив: когда какой.' },
  '6': { title: 'Relativsetninger', titleEn: 'Relative clauses', topic: 'OTHER', subtopic: 'Relativsetninger', summary: 'Относительные придаточные: som, предлог в конце, der/hvor.' },
  '7': { title: 'Betingelsessetninger', titleEn: 'Conditional clauses', topic: 'MOOD', subtopic: 'Betingelse', summary: 'Условные предложения трёх типов и инверсия без hvis.' },
  '8': { title: 'Adjektiv', titleEn: 'Adjectives', topic: 'ADJECTIVES', subtopic: 'Gradbøying', summary: 'Степени сравнения, причастия как прилагательные, прилагательное как существительное.' },
  '9': { title: 'Substantiv: bestemthet og eiendom', titleEn: 'Nouns: definiteness and possession', topic: 'NOUNS', subtopic: 'Bestemthet / eiendom', summary: 'Двойная определённость, genitiv и альтернативы, sin/hans.' },
  '10': { title: 'Tekstbinding og ordlaging', titleEn: 'Cohesion and word formation', topic: 'CONJUNCTIONS', subtopic: 'Tekstbinding', summary: 'Связки текста с инверсией и словообразование; сводное повторение.' },
};

// ─── Course layout: Level (Leksjon) → Module (sub-lesson) → Section → items ──
// A module can hold up to four sections: Nye ord (vocab) → Tekst (lesson) →
// Øvelser (exercises) for a text sub-lesson, or Grammatikk → Øvelser for the
// grammar module. Nye ord / Øvelser only appear when their data is authored.
type Item =
  | { kind: 'lesson'; key: string }
  | { kind: 'vocab'; key: string }
  | { kind: 'grammar'; key: string }
  | { kind: 'exercises'; key: string };

interface ModuleSection {
  key: string;
  title: string;
  items: Item[];
}

interface ModuleDef {
  key: string; // e.g. '1A' — globally unique module-container id namespace
  title: string;
  titleEn: string;
  description: string;
  sections: ModuleSection[];
}

interface LevelDef {
  key: string; // 'lek1' — course-level section id namespace
  title: string;
  subLessons: ModuleDef[];
}

const SEC_VOCAB = 'Nye ord';
const SEC_TEXTS = 'Tekst';
const SEC_GRAMMAR = 'Grammatikk';
const SEC_PRACTICE = 'Øvelser';

const vocabSec = (key: string): ModuleSection => ({
  key: 'nyeord',
  title: SEC_VOCAB,
  items: [{ kind: 'vocab', key }],
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

// A text sub-lesson module: Nye ord (if authored) → Tekst → Øvelser (if authored).
const textModule = (key: string): ModuleDef => {
  const meta = lessonMeta[key];
  const sections: ModuleSection[] = [];
  if (vocab[key]) sections.push(vocabSec(key));
  sections.push(textSec(key));
  if (exercises[key]) sections.push(practiceSec(key));
  return {
    key,
    title: meta.title,
    titleEn: meta.titleEn,
    description: meta.description,
    sections,
  };
};

// The closing "Grammatikk og øvelser" module: Grammatikk → Øvelser (if authored).
// Grammar exercises are keyed by leksjon number and wired into the grammar rule's
// practice pool (grammarMeta[num] exists → pool wiring in populateModuleVersion).
const grammarModule = (num: string): ModuleDef => {
  const meta = grammarMeta[num];
  const sections: ModuleSection[] = [
    { key: 'grammatikk', title: SEC_GRAMMAR, items: [{ kind: 'grammar', key: num }] },
  ];
  if (exercises[num]) sections.push(practiceSec(num));
  return {
    key: `${num}-gram`,
    title: `${num} — Grammatikk og øvelser`,
    titleEn: `${num} — Grammar and practice`,
    description: exercises[num] ? `${meta.title}, med øvelser.` : `${meta.title}. Øvelser kommer.`,
    sections,
  };
};

// Each leksjon: text modules A/B/C + "D — Les og lytt" + a grammar module.
const leksjon = (num: number, title: string): LevelDef => {
  const n = String(num);
  return {
    key: `lek${n}`,
    title,
    subLessons: [
      textModule(`${n}A`),
      textModule(`${n}B`),
      textModule(`${n}C`),
      textModule(`${n}D`),
      grammarModule(n),
    ],
  };
};

const levels: LevelDef[] = [
  leksjon(1, 'Leksjon 1 — Arbeidsliv'),
  leksjon(2, 'Leksjon 2 — Utdanning og kurs'),
  leksjon(3, 'Leksjon 3 — Bolig og økonomi'),
  leksjon(4, 'Leksjon 4 — Helse og livsstil'),
  leksjon(5, 'Leksjon 5 — Miljø og natur'),
  leksjon(6, 'Leksjon 6 — Media og teknologi'),
  leksjon(7, 'Leksjon 7 — Samfunn og demokrati'),
  leksjon(8, 'Leksjon 8 — Kultur og tradisjoner'),
  leksjon(9, 'Leksjon 9 — Norge før og nå'),
  leksjon(10, 'Leksjon 10 — Framtidsplaner'),
];

// Flat list of every sub-lesson module, in course order.
const modules: ModuleDef[] = levels.flatMap((l) => l.subLessons);

// ─── Seeding logic ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('Seeding «Norsk B1» (leksjon 1–10)…');

  // Exercise templates must exist (seeded by prisma/seed.ts). Only needed for
  // leksjoner that have authored exercises; resolve upfront so failures are loud.
  // Taken from the data itself, so authoring an exercise on a new template
  // needs no edit here — a hardcoded list would report it as missing even
  // after prisma/seed.ts had seeded it.
  const usedCodes = new Set(Object.values(exercises).flat().map((e) => e.template));
  const templates = await prisma.exerciseTemplate.findMany({
    where: { code: { in: [...usedCodes] } },
  });
  const templateByCode = new Map(templates.map((t) => [t.code, t.id]));
  const missing = [...usedCodes].filter((c) => !templateByCode.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Missing exercise templates: ${missing.join(', ')}. Run "npm run prisma:seed" first.`,
    );
  }

  const courseId = id('container', 'norsk-b1');
  const coursePubVersionId = id('version', 'norsk-b1-v1');
  const courseDraftVersionId = id('version', 'norsk-b1-draft');
  const courseTitle = 'Norsk B1';
  const courseDescription =
    'Kurs i norsk på B1-nivå, en fortsettelse etter «Ny i Norge — A2». Ti leksjoner ' +
    'om arbeidsliv, utdanning, bolig og økonomi, helse, miljø, media, samfunn, kultur, ' +
    'Norges historie og framtidsplaner. Hver leksjon har lesetekster, ordforråd, ' +
    'grammatikk og øvelser, med sikte på Norskprøven B1. (Skjelett – innhold fylles ut ' +
    'leksjon for leksjon.)';

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
      slug: 'norsk-b1',
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

  await ensureVersions(courseId, coursePubVersionId, courseDraftVersionId, 'Leksjon 1–10 (skjelett).');
  console.log('  ✓ Course container + published/draft versions');

  for (const mod of modules) {
    await seedModule(mod, templateByCode);
    console.log(`  ✓ ${mod.title}`);
  }

  // Glossary marks depend on both the lesson variant and the vocabulary items,
  // so derive them once every module has been seeded.
  let markedLessons = 0;
  let markTotal = 0;
  for (const key of Object.keys(vocab)) {
    if (!lessonMeta[key]) continue;
    const marks = await seedGlossaryMarks(key);
    if (marks > 0) {
      markedLessons++;
      markTotal += marks;
    }
  }
  console.log(`  ✓ Glossary marks: ${markTotal} across ${markedLessons} lesson texts`);

  // Text annotations sit on the lesson variant and point at grammar rules, so
  // they too need every module seeded first.
  let spanTotal = 0;
  for (const key of Object.keys(spans)) {
    if (!lessonMeta[key]) continue;
    spanTotal += await seedTextSpans(key);
  }
  console.log(`  ✓ Text spans: ${spanTotal} across ${Object.keys(spans).length} lesson texts`);

  // Rebuild BOTH course versions: one level section per Leksjon, holding its
  // sub-lesson module CONTAINER items. Wiped and recreated each run.
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

async function seedModule(mod: ModuleDef, templateByCode: Map<string, string>): Promise<void> {
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

  for (const versionId of [modulePubVersionId, moduleDraftVersionId]) {
    await populateModuleVersion(versionId, mod, templateByCode);
  }
}

async function populateModuleVersion(
  versionId: string,
  mod: ModuleDef,
  templateByCode: Map<string, string>,
): Promise<void> {
  await prisma.containerItem.deleteMany({ where: { containerVersionId: versionId } });
  await prisma.containerSection.deleteMany({ where: { containerVersionId: versionId } });

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
        // exercises: seed each, and wire into the grammar rule's practice pool
        // only when the Leksjon has a grammar rule with this key (grammar module).
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
      slug: `norsk-b1-${key.toLowerCase()}`,
      title: meta.title,
      description: meta.description,
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
    },
  });
  const variantId = id('lesson-variant', key);
  const body = readBody('lessons', key, meta.title);
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

async function seedGrammar(key: string): Promise<void> {
  const meta = grammarMeta[key];
  const grammarId = id('grammar', key);
  await prisma.grammarRule.upsert({
    where: { id: grammarId },
    update: { title: meta.title, subtopic: meta.subtopic, ownerUserId: TEACHER_ID, ownerSchoolId: SCHOOL_ID, visibility: VISIBILITY },
    create: {
      id: grammarId,
      slug: `norsk-b1-leksjon-${key}-grammatikk`,
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
  const body = readBody('grammar', key, meta.title);
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

async function seedVocab(key: string): Promise<void> {
  const section = vocab[key];
  const listId = id('vocab', key);
  await prisma.vocabularyList.upsert({
    where: { id: listId },
    update: { title: section.title, ownerUserId: TEACHER_ID, ownerSchoolId: SCHOOL_ID, visibility: VISIBILITY },
    create: {
      id: listId,
      slug: `norsk-b1-${key.toLowerCase()}-ordforraad`,
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

/**
 * Counts whole-word occurrences of `surface` in `body`.
 *
 * Boundaries are letter/mark/number lookarounds rather than `\b`, matching the
 * reader's glossary tokenizer (web: features/learning/lib/tokenize-glossary.ts).
 * `\b` has ASCII semantics, so it treats æøå as non-letters and would report a
 * false hit for «er» inside «hjerte».
 */
function countOccurrences(body: string, surface: string): number {
  const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escaped}(?![\\p{L}\\p{M}\\p{N}])`, 'giu');
  return [...body.matchAll(re)].length;
}

/** Surface forms a word can appear as: the lemma plus every inflection the data carries. */
function surfaceForms(w: VocabWord): string[] {
  const values = [w.word, ...Object.values(w.grammaticalProperties ?? {})]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    // `gender: "masculine"` and `verb_class` are metadata, not surface forms; they
    // are filtered by never occurring in a Norwegian body text, but drop the known
    // ones explicitly so a stray match can't create a bogus mark.
    .filter((v) => !GRAMMAR_METADATA_VALUES.has(v.toLowerCase()));
  return [...new Map(values.map((v) => [v.toLowerCase(), v])).values()];
}

const GRAMMAR_METADATA_VALUES = new Set(['masculine', 'feminine', 'neuter', 'a-verb', 'e-verb']);

/**
 * Derives glossary marks for a text sub-lesson: every word of the leksjon's
 * vocabulary list that actually occurs in the lesson body, in any of its
 * declared forms. Marks the seed no longer derives are removed, so an edited
 * body text doesn't leave stale highlights behind.
 */
async function seedGlossaryMarks(key: string): Promise<number> {
  const section = vocab[key];
  if (!section) return 0;

  const variantId = id('lesson-variant', key);
  const body = readBody('lessons', key, lessonMeta[key].title);

  const keptIds: string[] = [];
  for (const [i, w] of section.words.entries()) {
    const occurrences = surfaceForms(w).reduce((sum, form) => sum + countOccurrences(body, form), 0);
    if (occurrences === 0) continue;

    const markId = id('glossary-mark', `${key}-${i}`);
    keptIds.push(markId);
    await prisma.lessonVariantGlossaryMark.upsert({
      where: { id: markId },
      update: { occurrenceCount: occurrences },
      create: {
        id: markId,
        lessonContentVariantId: variantId,
        vocabularyItemId: id('vocab-item', `${key}-${i}`),
        occurrenceCount: occurrences,
      },
    });
  }

  await prisma.lessonVariantGlossaryMark.deleteMany({
    where: { lessonContentVariantId: variantId, id: { notIn: keptIds } },
  });

  return keptIds.length;
}

/**
 * Splits a lesson body exactly as the read model does
 * (MarkdownParagraphSplitterService): blank-line delimited, trimmed, empties
 * dropped. Span offsets are into these paragraphs, so the two splitters must
 * not drift apart.
 */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Locates an authored phrase in a body, tolerating the body's hard line wraps:
 * whitespace in the phrase matches any run of whitespace in the paragraph.
 * Returns the paragraph index and the *actual* slice, which becomes the span's
 * text_snapshot — the reader compares that snapshot against the live body, so
 * it must be the paragraph's own characters, not the authored phrase.
 */
function locatePhrase(
  paragraphs: string[],
  phrase: string,
  occurrence: number,
): { paragraphIndex: number; charStart: number; charEnd: number; snapshot: string } | null {
  const pattern = phrase
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');

  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const matches = [...paragraph.matchAll(new RegExp(pattern, 'gu'))];
    const match = matches[occurrence - 1];
    if (!match || match.index === undefined) continue;
    return {
      paragraphIndex,
      charStart: match.index,
      charEnd: match.index + match[0].length,
      snapshot: match[0],
    };
  }
  return null;
}

/**
 * Seeds the authored grammar/chunk annotations for one text sub-lesson.
 *
 * Offsets are derived from the body here rather than stored in the data file:
 * an authored character offset would silently point at the wrong words after
 * any edit to the text, while a phrase either still occurs or fails loudly.
 *
 * Cleanup is deliberately limited to this seed's own deterministic ids (a
 * window past the current entry count), so removing an entry from spans.json
 * drops its span while annotations an author created in the UI are left alone.
 */
async function seedTextSpans(key: string): Promise<number> {
  const entries = spans[key];
  const variantId = id('lesson-variant', key);
  const paragraphs = splitParagraphs(readBody('lessons', key, lessonMeta[key].title));

  const keptIds: string[] = [];
  for (const [i, def] of entries.entries()) {
    const at = locatePhrase(paragraphs, def.phrase, def.occurrence ?? 1);
    if (!at) {
      throw new Error(
        `Span phrase not found in lesson ${key}: "${def.phrase}". ` +
          'The body text changed — update prisma/data/norsk-b1/spans.json.',
      );
    }

    const spanId = id('text-span', `${key}-${i}`);
    keptIds.push(spanId);
    const data = {
      paragraphIndex: at.paragraphIndex,
      charStart: at.charStart,
      charEnd: at.charEnd,
      kind: (def.kind === 'grammar' ? 'GRAMMAR' : 'CHUNK') as never,
      refId: def.kind === 'grammar' ? id('grammar', def.grammarKey!) : null,
      textSnapshot: at.snapshot,
      note: def.note ?? null,
    };
    await prisma.lessonTextSpan.upsert({
      where: { id: spanId },
      update: data,
      create: {
        id: spanId,
        lessonContentVariantId: variantId,
        createdByUserId: TEACHER_ID,
        ...data,
      },
    });
  }

  const staleIds = Array.from({ length: 20 }, (_, n) => id('text-span', `${key}-${entries.length + n}`));
  await prisma.lessonTextSpan.deleteMany({ where: { id: { in: staleIds } } });

  return keptIds.length;
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
