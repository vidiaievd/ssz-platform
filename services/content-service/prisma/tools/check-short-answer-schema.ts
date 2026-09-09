/**
 * Validates every stored `short_answer` document against the template schema that is
 * actually in the database — not the one in seed.ts, which is only the same after a
 * reseed.
 *
 * The regression this guards is the one plan 51 §8 Q1 created: `short_answer` now has
 * two live document shapes, and the schema is checked on every write. A schema that
 * stopped accepting the old form would make 144 seeded exercises silently unsaveable,
 * and with autosave the author would not even see the failure.
 *
 *   DATABASE_URL=... npx tsx prisma/tools/check-short-answer-schema.ts
 */
// Validate every stored short_answer document against the schema now in the database.
import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import Ajv from 'ajv';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});
const ajv = new Ajv({ allErrors: true, strict: false });

const template = await prisma.exerciseTemplate.findUnique({ where: { code: 'short_answer' } });
const content = ajv.compile(template.contentSchema);
const answers = ajv.compile(template.answerSchema);

const rows = await prisma.exercise.findMany({
  where: { template: { code: 'short_answer' } },
  select: { id: true, content: true, expectedAnswers: true },
});

let badContent = 0;
let badAnswers = 0;
let newFormCount = 0;
for (const row of rows) {
  // The same test every reader dispatches on — `isShortAnswerDocument` in the kernel.
  if (Array.isArray((row.content as { questions?: unknown } | null)?.questions)) newFormCount += 1;
  if (!content(row.content)) {
    badContent += 1;
    if (badContent <= 3) console.log('  content', row.id, ajv.errorsText(content.errors));
  }
  if (!answers(row.expectedAnswers)) {
    badAnswers += 1;
    if (badAnswers <= 3) console.log('  key    ', row.id, ajv.errorsText(answers.errors));
  }
}
console.log(
  `stored: ${rows.length} (${newFormCount} new form, ${rows.length - newFormCount} old form) — ` +
    `invalid content: ${badContent}, invalid key: ${badAnswers}`,
);

// And the shapes nothing has written yet: a finished new-form document, the half-written
// state autosave has to accept, and something that is neither form.
const newForm = {
  title: 'Leseforståelse 1A',
  instruction: 'Svar med egne ord.',
  questions: [
    { id: 'q1', kind: 'reading', passage: 'En tekst.', prompt: 'Hva skjer?' },
  ],
  settings: { passRule: 'all', passN: 2, typos: true, caseless: true, minWords: 3, showBreakdown: true, showModel: 'onClose', aiStage: false, aiGrammar: true, teacherReview: 'flagged', progress: true },
};
const newKey = {
  questions: { q1: { elements: [{ id: 'e1', label: 'Noe', anchors: ['en ting'], required: true }], model: 'Det skjer en ting.', why: 'Fordi.' } },
};
console.log('new form content:', content(newForm) || ajv.errorsText(content.errors));
console.log('new form key:', answers(newKey) || ajv.errorsText(answers.errors));
console.log('mid-write (no questions yet):', content({ title: '', instruction: '', questions: [], settings: {} }) || ajv.errorsText(content.errors));
console.log('neither form (rejected):', content({ title: 'x' }) === false ? 'rejected, as intended' : 'ACCEPTED — schema too loose');

await prisma.$disconnect();
