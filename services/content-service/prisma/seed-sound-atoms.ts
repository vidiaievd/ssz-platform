/**
 * Idempotent seed of the `sound` atom catalogue (plan 86, step 8.1) and its articulation base
 * (step 9.1). Run: npx tsx prisma/seed-sound-atoms.ts
 *
 * Safe to run repeatedly. It owns the atom rows, the carrier words and every text field: no
 * screen edits them, so the data files are the source and a rerun overwrites the rows.
 */
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SOUND_ATOMS, soundAtomKey, type SoundAtomLocale } from './data/sound-atoms.js';
import { SOUND_ATOM_BASE } from './data/sound-atom-base.js';

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

async function main() {
  assertBaseComplete();
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
  }
  console.log(`Sound atoms: ${SOUND_ATOMS.length} upserted with their articulation base.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
