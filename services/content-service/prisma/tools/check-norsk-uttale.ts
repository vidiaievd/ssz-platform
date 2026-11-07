/**
 * Acceptance check of the «Norsk uttale» seed data (plan 86, step 12.1).
 *
 * `prisma/data/norsk-uttale/exercises.json` is written by the course's converter
 * (`docs/courses/norsk_uttale/tools/to_seed.py`), not by hand, so this is the place where it
 * meets the platform's own rules before a seed writes a row:
 *
 *   - the template schemas, through the AJV the write path uses (`templates/*.ts`);
 *   - the kernel's round trip: `toContent(fromPersisted(…))` gives the same document back, so
 *     nothing the converter wrote is a field the kernel drops or a value it coerces;
 *   - the kernel's `issues()` — the blockers of the publication preflight. A `read_aloud` must
 *     have none. A `minimal_pairs` is expected to report missing clips and nothing else (its
 *     clips come in step 12.3, and until then the seed keeps it out of the module);
 *   - no part of the key in the student projection: no listening note, no focus word, no level
 *     descriptor (`read_aloud`), no word text, gloss or IPA (`minimal_pairs`);
 *   - the phrase layers (`prosody`, step 12.4): each notation is its prompt's text exactly
 *     (`checkProsodyNotation`), its layer lies on the text (`prosodyIssues`), and the pronunciation
 *     guide has no blocker with the layers in — so a `melody` lens is offered only where every
 *     sentence ends a group with a pitch.
 *
 *   npx tsx prisma/tools/check-norsk-uttale.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as ra from '@ssz/shared-kernel/read-aloud';
import * as mp from '@ssz/shared-kernel/minimal-pairs';
import { checkProsodyNotation, emptyProsodyLayer, prosodyIssues } from '@ssz/shared-kernel/prosody';
import { ExerciseContentValidatorService as Validator } from '../../src/modules/exercise/domain/services/exercise-content-validator.service.js';
import { readAloudTemplate } from '../templates/read-aloud.js';
import { minimalPairsTemplate } from '../templates/minimal-pairs.js';

interface Exercise {
  key: string;
  template: 'read_aloud' | 'minimal_pairs';
  instruction: string;
  content: Record<string, unknown>;
  expectedAnswers: Record<string, unknown>;
  targets: string[];
  /** read_aloud: prompt id → its phrase layer in the kernel notation (step 12.4). */
  prosody?: Record<string, string>;
}

const FILE = join(process.cwd(), 'prisma', 'data', 'norsk-uttale', 'exercises.json');
const SOUND_ATOM = /^nb:(vowel_length|schwa|y|uu|oe|ae|kj|sj|r|retroflex|tone)$/;
// The data carries no clips (they live in the seeded rows, step 12.3): these are the only issues a pair set may raise.
const MP_CLIP_CODES = new Set(['MP_NO_CLIP', 'MP_WORD_NO_CLIP', 'MP_CLIP_MISSING']);

const templates = {
  read_aloud: readAloudTemplate({ type: 'object' }),
  minimal_pairs: minimalPairsTemplate(),
};

function main(): void {
  const data = JSON.parse(readFileSync(FILE, 'utf-8')) as Record<string, Exercise[]>;
  const problems: string[] = [];
  const mpCodes = new Map<string, number>();
  const warnings = new Map<string, number>();
  let seen = 0;

  const fail = (ex: Exercise, msg: string) => problems.push(`${ex.key}: ${msg}`);

  for (const items of Object.values(data)) {
    for (const ex of items) {
      seen += 1;
      const t = templates[ex.template];
      if (!t) {
        fail(ex, `unknown template ${ex.template}`);
        continue;
      }
      const c = Validator.validate(ex.content, t.contentSchema);
      if (!c.isOk) fail(ex, `content schema: ${JSON.stringify(c.error).slice(0, 300)}`);
      const a = Validator.validateAnswers(ex.expectedAnswers, t.answerSchema);
      if (!a.isOk) fail(ex, `answer schema: ${JSON.stringify(a.error).slice(0, 300)}`);
      for (const atom of ex.targets) if (!SOUND_ATOM.test(atom)) fail(ex, `target ${atom}`);
      if (!ex.instruction.trim()) fail(ex, 'no instruction');

      if (ex.template === 'read_aloud') checkReadAloud(ex, fail, warnings);
      else checkMinimalPairs(ex, fail, mpCodes);
    }
  }

  const layers = Object.values(data)
    .flat()
    .reduce((n, ex) => n + Object.keys(ex.prosody ?? {}).length, 0);
  const melody = Object.values(data)
    .flat()
    .filter((ex) => JSON.stringify(ex.content).includes('"melody"')).length;
  console.log(`${seen} exercises checked; ${layers} phrase layers, melody lens in ${melody}`);
  if (warnings.size > 0) {
    console.log('read_aloud warnings (not blockers):');
    for (const [code, n] of warnings) console.log(`  ${code} ×${n}`);
  }
  if (mpCodes.size > 0) {
    console.log('minimal_pairs issues of the data (clips live in the seeded rows, clip-norsk-uttale.ts):');
    for (const [code, n] of mpCodes) console.log(`  ${code} ×${n}`);
  }
  if (problems.length > 0) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(`  ${p}`);
    process.exit(1);
  }
  console.log('OK: no blockers, no leaks, the kernel round trip is exact');
}

function checkReadAloud(
  ex: Exercise,
  fail: (ex: Exercise, msg: string) => void,
  warnings: Map<string, number>,
): void {
  const doc = ra.fromPersisted(ex.content, ex.expectedAnswers);
  if (!isDeepStrictEqual(ra.toContent(doc), ex.content)) fail(ex, 'content changes in the kernel round trip');
  if (!isDeepStrictEqual(ra.toExpectedAnswers(doc), ex.expectedAnswers)) {
    fail(ex, 'expected answers change in the kernel round trip');
  }

  for (const issue of ra.issues(doc, { audio: false })) {
    if (issue.level === 'blocker') fail(ex, `blocker ${JSON.stringify(issue)}`);
    else warnings.set(issue.code, (warnings.get(issue.code) ?? 0) + 1);
  }
  // Every prompt is given to the guide — an unmarked one with an empty layer — so a melody lens
  // over a prompt without phrase marks is the blocker it would be in the preflight.
  const guide: Record<string, ra.GuidePrompt> = {};
  for (const p of doc.prompts) guide[p.id] = { layer: emptyProsodyLayer(), unresolved: [] };
  for (const [promptId, notation] of Object.entries(ex.prosody ?? {})) {
    const prompt = doc.prompts.find((p) => p.id === promptId);
    if (!prompt || doc.mode !== 'read') {
      fail(ex, `prosody of ${promptId}: no such read prompt`);
      continue;
    }
    const parsed = checkProsodyNotation(prompt.text, notation);
    if (parsed.issues.length > 0) {
      fail(ex, `prosody of ${promptId}: ${JSON.stringify(parsed.issues)}`);
      continue;
    }
    const onText = prosodyIssues(prompt.text, parsed.layer).filter((x) => x.level === 'blocker');
    if (onText.length > 0) fail(ex, `prosody of ${promptId}: ${JSON.stringify(onText)}`);
    guide[promptId] = { layer: parsed.layer, unresolved: [] };
  }
  for (const issue of ra.guideIssues(doc, guide)) {
    if (issue.level === 'blocker') fail(ex, `guide blocker ${JSON.stringify(issue)}`);
  }

  const projected = JSON.stringify(ra.toStudentProjection(ex.content, ex.expectedAnswers));
  for (const p of doc.prompts) {
    if (p.note && projected.includes(JSON.stringify(p.note).slice(1, -1))) fail(ex, `note of ${p.id} leaks`);
  }
  for (const levels of Object.values(
    (ex.expectedAnswers.rubric ?? {}) as Record<string, { levels: string[] }>,
  )) {
    // Level 3 doubles as the criterion's description, which the student may see before the
    // verdict (`studentVisible`); the three below it must not be there.
    for (const level of levels.levels.slice(0, 3)) {
      if (projected.includes(JSON.stringify(level).slice(1, -1))) fail(ex, `level descriptor leaks: ${level}`);
    }
  }
}

function checkMinimalPairs(
  ex: Exercise,
  fail: (ex: Exercise, msg: string) => void,
  codes: Map<string, number>,
): void {
  const doc = mp.fromPersisted(ex.content, ex.expectedAnswers);
  if (!isDeepStrictEqual(mp.toContent(doc), ex.content)) fail(ex, 'content changes in the kernel round trip');
  if (!isDeepStrictEqual(mp.toExpectedAnswers(doc), ex.expectedAnswers)) {
    fail(ex, 'expected answers change in the kernel round trip');
  }

  for (const issue of mp.issues(doc)) {
    if (issue.level !== 'blocker') continue;
    codes.set(issue.code, (codes.get(issue.code) ?? 0) + 1);
    if (!MP_CLIP_CODES.has(issue.code)) fail(ex, `blocker ${JSON.stringify(issue)}`);
  }

  const projected = JSON.stringify(mp.toStudentProjection(ex.content));
  for (const pair of doc.pairs) {
    for (const w of pair.words) {
      for (const leak of [w.text, w.gloss, w.ipa]) {
        if (leak && new RegExp(`"${leak.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(projected)) {
          fail(ex, `word ${w.id} leaks: ${leak}`);
        }
      }
    }
  }
}

main();
