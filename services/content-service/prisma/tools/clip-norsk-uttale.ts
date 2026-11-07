/**
 * Clips of the «Norsk uttale» `minimal_pairs` (plan 86, step 12.3).
 *
 * Every word of a pair set that may be synthesized gets a clip: media-service's piper voice says
 * the word as an `exercise_asset` of the course teacher, bound to the exercise
 * (`POST internal/media/pronunciation/clip`), and once processing has measured it the clip is
 * written into the seeded exercise row — `provenance: 'tts'`, one voice for the whole set, so no
 * pair mixes voices.
 *
 * The clips live in the database row, not in `prisma/data/`: an asset id is a fact of one
 * environment's media store, and a reseed carries the stored clips over (seed-norsk-uttale.ts).
 * A word that already has a clip is left alone, so a second run asks for nothing.
 *
 * A set holding a contrast the pack marks `tts: 'no'` (`kjsj`, `tone`) is skipped whole: the
 * kernel blocks synthesized clips there, and those sets wait for native recordings.
 *
 * Run from services/content-service after seed-norsk-uttale.ts, then run the seed again — it
 * places every set that has no blockers left into its module:
 *   npx tsx prisma/tools/clip-norsk-uttale.ts [--dry-run]
 *
 * Env: DATABASE_URL, INTERNAL_SERVICE_TOKEN; MEDIA_SERVICE_URL (default http://localhost:3004).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, Prisma } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { v5 as uuidv5 } from 'uuid';
import * as mp from '@ssz/shared-kernel/minimal-pairs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

// Same namespace and teacher as seed-norsk-uttale.ts.
const NAMESPACE = '9e4c1a7b-3d58-4f2e-a6b1-7c0d2e8f5a93';
const TEACHER_ID = '0b2f2404-854a-4ea5-9d33-816db353983f';
const exerciseIdOf = (key: string): string => uuidv5(`exercise:${key}`, NAMESPACE);

const MEDIA_URL = (process.env.MEDIA_SERVICE_URL ?? 'http://localhost:3004').replace(/\/$/, '');
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const DRY_RUN = process.argv.includes('--dry-run');

const FILE = join(process.cwd(), 'prisma', 'data', 'norsk-uttale', 'exercises.json');
const READY_TIMEOUT_MS = 60_000;
const POLL_MS = 1_000;

interface Def {
  key: string;
  template: string;
}

interface Described {
  id: string;
  status: string;
  durationMs: number | null;
}

async function media<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${MEDIA_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-token': TOKEN },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** The asset's measured duration once processing is done; a failed asset is an error. */
async function waitReady(ids: string[]): Promise<Map<string, number>> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const done = new Map<string, number>();
  while (done.size < ids.length) {
    const pending = ids.filter((i) => !done.has(i));
    for (let at = 0; at < pending.length; at += 100) {
      const described = await media<Described[]>('/api/v1/internal/media/assets/describe', {
        ids: pending.slice(at, at + 100),
      });
      for (const d of described) {
        if (d.status === 'FAILED' || d.status === 'DELETED') throw new Error(`asset ${d.id} is ${d.status}`);
        if (d.status === 'READY' && d.durationMs) done.set(d.id, d.durationMs);
      }
    }
    if (done.size === ids.length) break;
    if (Date.now() > deadline) throw new Error(`${ids.length - done.size} asset(s) not READY in time`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return done;
}

/** The `tts: 'no'` contrasts a set holds — any one keeps the whole set from synthesis. */
function blockedContrasts(doc: mp.MinimalPairsContent): string[] {
  return [
    ...new Set(
      doc.pairs.map((p) => mp.pairContrast(doc, p)).filter((c) => c?.tts === 'no').map((c) => c!.id),
    ),
  ];
}

async function main(): Promise<void> {
  if (!TOKEN) throw new Error('INTERNAL_SERVICE_TOKEN is not set');
  const data = JSON.parse(readFileSync(FILE, 'utf-8')) as Record<string, Def[]>;
  const keys = Object.values(data)
    .flat()
    .filter((d) => d.template === 'minimal_pairs')
    .map((d) => d.key);

  let made = 0;
  let ready = 0;
  const waiting: string[] = [];
  for (const key of keys) {
    const exerciseId = exerciseIdOf(key);
    const row = await prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!row) throw new Error(`${key}: exercise ${exerciseId} not seeded — run seed-norsk-uttale.ts first`);
    let doc = mp.fromPersisted(row.content, row.expectedAnswers);

    const blocked = blockedContrasts(doc);
    if (blocked.length > 0) {
      waiting.push(`${key} (${blocked.join(', ')})`);
      continue;
    }

    const missing = doc.pairs.flatMap((p) =>
      p.words.filter((w) => !mp.hasClip(w.clip)).map((w) => ({ pairId: p.id, word: w })),
    );
    if (missing.length === 0) {
      ready += 1;
      console.log(`  = ${key}: every word has a clip`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  · ${key}: would synthesize ${missing.map((m) => m.word.text).join(', ')}`);
      continue;
    }

    const asked: { pairId: string; wordId: string; text: string; assetId: string; voice: string }[] = [];
    for (const m of missing) {
      const clip = await media<{ assetId: string; voice: string }>('/api/v1/internal/media/pronunciation/clip', {
        ownerId: TEACHER_ID,
        text: m.word.text,
        lang: doc.language,
        exerciseId,
      });
      asked.push({ pairId: m.pairId, wordId: m.word.id, text: m.word.text, ...clip });
    }
    const durations = await waitReady(asked.map((a) => a.assetId));
    for (const a of asked) {
      doc = mp.setClip(doc, a.pairId, a.wordId, {
        assetId: a.assetId,
        fileName: `${a.text.trim().replace(/[\\/:*?"<>|\s]+/g, '-')}.mp3`,
        durationMs: durations.get(a.assetId)!,
        provenance: 'tts',
        voice: a.voice,
      });
    }
    await prisma.exercise.update({
      where: { id: exerciseId },
      data: { content: mp.toContent(doc) as unknown as Prisma.InputJsonValue },
    });
    made += asked.length;
    ready += 1;

    const blockers = mp.issues(doc).filter((i) => i.level === 'blocker');
    console.log(
      `  ✓ ${key}: ${asked.length} clip(s)` +
        (blockers.length ? ` — still blocked: ${blockers.map((b) => b.code).join(', ')}` : ''),
    );
  }

  console.log(
    `${DRY_RUN ? 'Dry run: ' : ''}${made} clip(s) made, ${ready} set(s) with every clip, ` +
      `${waiting.length} waiting for native recordings${waiting.length ? `: ${waiting.join('; ')}` : ''}`,
  );
  if (!DRY_RUN && made > 0) console.log('Run prisma/seed-norsk-uttale.ts again to place the sets in their modules.');
}

main()
  .catch((err) => {
    console.error('Clips failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
