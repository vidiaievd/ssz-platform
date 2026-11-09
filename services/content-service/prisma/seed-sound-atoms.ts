/**
 * Idempotent seed of the `sound` atom catalogue (plan 86, step 8.1), its articulation base
 * (step 9.1) and the drill material of the scored atoms (step 13.2: words, pairs, the cold-start
 * word, the course's short lines). Run: npx tsx prisma/seed-sound-atoms.ts
 *
 * The phrases come from prisma/data/sound-drill-phrases.json, which prisma/tools/sound-drill.ts
 * writes after checking every word against the lexicon — run that tool after changing the drill data.
 *
 * Safe to run repeatedly. It owns the atom rows, the carrier words and every text field: no
 * screen edits them, so the data files are the source and a rerun overwrites the rows.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SOUND_ATOMS, soundAtomKey, type SoundAtomLocale } from './data/sound-atoms.js';
import { SOUND_ATOM_BASE } from './data/sound-atom-base.js';
import { SOUND_ATOM_DRILL } from './data/sound-atom-drill.js';

interface DrillPhrase {
  text: string;
  carriers: string[];
  source: string;
}

const PHRASES_FILE = join(process.cwd(), 'prisma', 'data', 'sound-drill-phrases.json');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

/** Every atom has its base in every title locale — a gap fails the run before any write. */
function assertBaseComplete(): void {
  const gaps: string[] = [];
  for (const atom of SOUND_ATOMS) {
    const id = soundAtomKey(atom.language, atom.family);
    const base = SOUND_ATOM_BASE[id];
    if (!base) {
      gaps.push(`${id}: no base`);
      continue;
    }
    if (base.carrierWords.length === 0) gaps.push(`${id}: no carrier words`);
    for (const locale of Object.keys(atom.titles) as SoundAtomLocale[]) {
      if (!base.texts[locale]) gaps.push(`${id}: no ${locale} texts`);
    }
  }
  const known = new Set(SOUND_ATOMS.map((a) => soundAtomKey(a.language, a.family)));
  for (const id of Object.keys(SOUND_ATOM_BASE)) {
    if (!known.has(id)) gaps.push(`${id}: base for an unknown atom`);
  }
  if (gaps.length > 0) throw new Error(`Articulation base incomplete:\n${gaps.join('\n')}`);
}

/** Drill material for exactly the scored atoms, phrases for each — read before any write. */
function loadDrillPhrases(): Record<string, DrillPhrase[]> {
  const phrases = JSON.parse(readFileSync(PHRASES_FILE, 'utf8')) as Record<string, DrillPhrase[]>;
  const gaps: string[] = [];
  const scored = SOUND_ATOMS.filter((a) => a.scored).map((a) => soundAtomKey(a.language, a.family));
  for (const id of scored) {
    if (!SOUND_ATOM_DRILL[id]) gaps.push(`${id}: no drill`);
    if (!phrases[id]) gaps.push(`${id}: no phrases entry (run prisma/tools/sound-drill.ts)`);
  }
  for (const id of Object.keys(SOUND_ATOM_DRILL)) {
    if (!scored.includes(id)) gaps.push(`${id}: drill for an atom that is not scored`);
  }
  if (gaps.length > 0) throw new Error(`Drill material incomplete:\n${gaps.join('\n')}`);
  return phrases;
}

async function main() {
  assertBaseComplete();
  const phrases = loadDrillPhrases();
  const positions = new Map<string, number>();
  for (const atom of SOUND_ATOMS) {
    const id = soundAtomKey(atom.language, atom.family);
    const base = SOUND_ATOM_BASE[id];
    const position = (positions.get(atom.language) ?? 0) + 1;
    positions.set(atom.language, position);

    const row = { ipa: atom.ipa, scored: atom.scored, position, carrierWords: base.carrierWords };
    await prisma.soundAtom.upsert({
      where: { id },
      create: { id, language: atom.language, family: atom.family, ...row },
      update: row,
    });

    for (const [locale, title] of Object.entries(atom.titles) as Array<[SoundAtomLocale, string]>) {
      const fields = { title, ...base.texts[locale] };
      await prisma.soundAtomText.upsert({
        where: { soundAtomId_locale: { soundAtomId: id, locale } },
        create: { soundAtomId: id, locale, ...fields },
        update: fields,
      });
    }

    const drill = SOUND_ATOM_DRILL[id];
    if (drill) {
      const fields = {
        words: drill.words,
        pairs: drill.pairs,
        diagnostic: drill.diagnostic,
        phrases: phrases[id] as unknown as object[],
      };
      await prisma.soundAtomDrill.upsert({
        where: { soundAtomId: id },
        create: { soundAtomId: id, ...fields },
        update: fields,
      });
    }
  }
  console.log(
    `Sound atoms: ${SOUND_ATOMS.length} upserted with their articulation base; ` +
      `${Object.keys(SOUND_ATOM_DRILL).length} with drill material.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
