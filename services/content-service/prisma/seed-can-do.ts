/**
 * Idempotent seed of the GLOBAL CEFR A1–B2 can-do library.
 * Run: npx ts-node prisma/seed-can-do.ts
 * Safe to run repeatedly — uses upsert on (cefrLevel, skill, scope=global, ownerSchoolId=null).
 */
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

const SYSTEM_USER = '00000000-0000-0000-0000-000000000001';

interface DescriptorSeed {
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2';
  skill: 'LISTENING' | 'READING' | 'SPOKEN' | 'WRITTEN';
  source: string;
  en: string;
  nb: string;
}

const DESCRIPTORS: DescriptorSeed[] = [
  // A1 — Listening
  { cefrLevel: 'A1', skill: 'LISTENING', source: 'CEFR 2020',
    en: 'I can understand familiar words and very basic phrases when people speak slowly and clearly.',
    nb: 'Jeg kan forstå kjente ord og svært enkle fraser når folk snakker sakte og tydelig.' },
  // A1 — Reading
  { cefrLevel: 'A1', skill: 'READING', source: 'CEFR 2020',
    en: 'I can understand familiar names, words and very simple sentences, for example on notices and posters.',
    nb: 'Jeg kan forstå kjente navn, ord og svært enkle setninger, for eksempel på oppslag og plakater.' },
  // A1 — Spoken interaction
  { cefrLevel: 'A1', skill: 'SPOKEN', source: 'CEFR 2020',
    en: 'I can interact in a simple way if the other person is prepared to repeat or rephrase things.',
    nb: 'Jeg kan kommunisere på en enkel måte hvis den andre personen er villig til å gjenta eller omformulere.' },
  // A1 — Written
  { cefrLevel: 'A1', skill: 'WRITTEN', source: 'CEFR 2020',
    en: 'I can write a short, simple postcard and fill in forms with personal details.',
    nb: 'Jeg kan skrive et kort, enkelt postkort og fylle ut skjemaer med personopplysninger.' },

  // A2 — Listening
  { cefrLevel: 'A2', skill: 'LISTENING', source: 'CEFR 2020',
    en: 'I can understand phrases and the highest frequency vocabulary related to areas of most immediate relevance.',
    nb: 'Jeg kan forstå fraser og de mest brukte ordene knyttet til det som er mest relevant for meg.' },
  // A2 — Reading
  { cefrLevel: 'A2', skill: 'READING', source: 'CEFR 2020',
    en: 'I can read very short, simple texts and find specific predictable information in everyday material.',
    nb: 'Jeg kan lese svært korte, enkle tekster og finne spesifikk forutsigbar informasjon i hverdagslig materiale.' },
  // A2 — Spoken
  { cefrLevel: 'A2', skill: 'SPOKEN', source: 'CEFR 2020',
    en: 'I can communicate in simple and routine tasks requiring a simple and direct exchange of information.',
    nb: 'Jeg kan kommunisere i enkle og rutinepregede situasjoner som krever en enkel og direkte utveksling av informasjon.' },
  // A2 — Written
  { cefrLevel: 'A2', skill: 'WRITTEN', source: 'CEFR 2020',
    en: 'I can write short, simple notes and messages and a very simple personal letter.',
    nb: 'Jeg kan skrive korte, enkle notater og meldinger og et svært enkelt personlig brev.' },

  // B1 — Listening
  { cefrLevel: 'B1', skill: 'LISTENING', source: 'CEFR 2020',
    en: 'I can understand the main points of clear standard speech on familiar topics encountered in work, school or leisure.',
    nb: 'Jeg kan forstå hovedpunktene i klar standardtale om kjente emner fra jobb, skole eller fritid.' },
  // B1 — Reading
  { cefrLevel: 'B1', skill: 'READING', source: 'CEFR 2020',
    en: 'I can understand texts that consist mainly of high frequency everyday or job-related language.',
    nb: 'Jeg kan forstå tekster som i hovedsak består av høyfrekvente hverdagslige eller jobbrelaterte ord.' },
  // B1 — Spoken
  { cefrLevel: 'B1', skill: 'SPOKEN', source: 'CEFR 2020',
    en: 'I can deal with most situations likely to arise whilst travelling in an area where the language is spoken.',
    nb: 'Jeg kan håndtere de fleste situasjoner som kan oppstå ved reise i et område der språket snakkes.' },
  // B1 — Written
  { cefrLevel: 'B1', skill: 'WRITTEN', source: 'CEFR 2020',
    en: 'I can write simple connected text on familiar topics and describe experiences and events.',
    nb: 'Jeg kan skrive enkel sammenhengende tekst om kjente emner og beskrive erfaringer og hendelser.' },

  // B2 — Listening
  { cefrLevel: 'B2', skill: 'LISTENING', source: 'CEFR 2020',
    en: 'I can understand extended speech and lectures and follow complex lines of argument on familiar topics.',
    nb: 'Jeg kan forstå lengre tale og forelesninger og følge komplekse argumentasjonslinjer om kjente emner.' },
  // B2 — Reading
  { cefrLevel: 'B2', skill: 'READING', source: 'CEFR 2020',
    en: 'I can read articles and reports about contemporary problems and understand the argumentation.',
    nb: 'Jeg kan lese artikler og rapporter om aktuelle problemer og forstå argumentasjonen.' },
  // B2 — Spoken
  { cefrLevel: 'B2', skill: 'SPOKEN', source: 'CEFR 2020',
    en: 'I can interact with a degree of fluency and spontaneity with native speakers without strain for either party.',
    nb: 'Jeg kan kommunisere med en viss flyt og spontanitet med morsmålsbrukere uten anstrengelse for noen av partene.' },
  // B2 — Written
  { cefrLevel: 'B2', skill: 'WRITTEN', source: 'CEFR 2020',
    en: 'I can write clear, detailed text on a wide range of subjects related to my interests.',
    nb: 'Jeg kan skrive klar, detaljert tekst om et bredt spekter av emner knyttet til mine interesser.' },
];

async function main() {
  console.log(`Seeding ${DESCRIPTORS.length} GLOBAL can-do descriptors…`);

  for (const d of DESCRIPTORS) {
    const existing = await prisma.canDoDescriptor.findFirst({
      where: { cefrLevel: d.cefrLevel, skill: d.skill as never, scope: 'GLOBAL', ownerSchoolId: null, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.canDoDescriptorLocalization.upsert({
        where: { descriptorId_language: { descriptorId: existing.id, language: 'en' } },
        create: { descriptorId: existing.id, language: 'en', text: d.en },
        update: { text: d.en },
      });
      await prisma.canDoDescriptorLocalization.upsert({
        where: { descriptorId_language: { descriptorId: existing.id, language: 'nb' } },
        create: { descriptorId: existing.id, language: 'nb', text: d.nb },
        update: { text: d.nb },
      });
      console.log(`  [skip] ${d.cefrLevel}/${d.skill} already exists`);
    } else {
      await prisma.canDoDescriptor.create({
        data: {
          cefrLevel: d.cefrLevel,
          skill: d.skill as never,
          scope: 'GLOBAL',
          source: d.source,
          createdByUserId: SYSTEM_USER,
          localizations: {
            create: [
              { language: 'en', text: d.en },
              { language: 'nb', text: d.nb },
            ],
          },
        },
      });
      console.log(`  [create] ${d.cefrLevel}/${d.skill}`);
    }
  }

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
