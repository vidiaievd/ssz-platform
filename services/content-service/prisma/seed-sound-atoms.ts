/**
 * Idempotent seed of the `sound` atom catalogue (plan 86, step 8.1).
 * Run: npx ts-node --transpile-only prisma/seed-sound-atoms.ts
 *
 * Safe to run repeatedly. It owns the atom rows and the titles; the other text fields belong
 * to the articulation base (step 9.1) and are never overwritten here.
 */
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SOUND_ATOMS, soundAtomKey, type SoundAtomLocale } from './data/sound-atoms.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

async function main() {
  const positions = new Map<string, number>();
  for (const atom of SOUND_ATOMS) {
    const id = soundAtomKey(atom.language, atom.family);
    const position = (positions.get(atom.language) ?? 0) + 1;
    positions.set(atom.language, position);

    await prisma.soundAtom.upsert({
      where: { id },
      create: { id, language: atom.language, family: atom.family, ipa: atom.ipa, scored: atom.scored, position },
      update: { ipa: atom.ipa, scored: atom.scored, position },
    });

    for (const [locale, title] of Object.entries(atom.titles) as Array<[SoundAtomLocale, string]>) {
      await prisma.soundAtomText.upsert({
        where: { soundAtomId_locale: { soundAtomId: id, locale } },
        create: { soundAtomId: id, locale, title },
        update: { title },
      });
    }
  }
  console.log(`Sound atoms: ${SOUND_ATOMS.length} upserted.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
