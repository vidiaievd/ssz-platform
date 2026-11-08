/**
 * Reference clips of the pronunciation drill's words (plan 86, step 13.2c, Q30 A).
 *
 * Every word the drill may say — the carrier words, both members of each pair, the diagnostic
 * word and the carrier words of the course phrases (`sound_atom_drills`) — is asked of
 * media-service's self-checked reference synthesis (`POST internal/media/pronunciation/reference`):
 * a cloud voice says it in the frame «Nå sier jeg … igjen.» and ai-service checks the toneme it
 * spoke against the lexicon (plan 88). What came back lands in `sound_reference_clips`:
 *   - a clip → `asset_id` + `tone`;
 *   - a refusal (`TONE_AMBIGUOUS`, `REFERENCE_REJECTED`, `NOT_IN_LEXICON`, …) → `refusal`, no asset —
 *     the drill leaves the word out;
 *   - `NOT_AVAILABLE` / `SYNTHESIS_FAILED` (503) → nothing written, the next run asks again.
 *
 * The clip is a platform asset made once per word for good; asking again is free (media-service
 * serves the stored asset), but the script still skips words that already have a row, so a second
 * run calls nothing. `--retry-refused` asks again for refused words — media-service remembers a
 * refusal for 30 days, so before then the answer is the same.
 *
 * Azure's speech tier answers bursts with 429, and five failures open ai-service's breaker for
 * 30 s (`unavailable`), so the words go one at a time with a pause (`--pause-ms`, default 6 s),
 * and a word answered 503 waits a minute and is asked again (up to `RETRIES` times) before it is
 * left for the next run.
 *
 * The drill route caches a language for 10 minutes (`content:sound-atom-drill:<language>`); new
 * clips show up there after that.
 *
 * Run from services/content-service after seed-sound-atoms.ts:
 *   npx tsx prisma/tools/reference-sound-atoms.ts [--dry-run] [--retry-refused] [--atom nb:kj] [--concurrency 1] [--pause-ms 6000]
 *
 * Env: DATABASE_URL, INTERNAL_SERVICE_TOKEN (the media-service one — infrastructure/.env.dev on dev);
 * MEDIA_SERVICE_URL (default http://localhost:3004).
 */
import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

const MEDIA_URL = (process.env.MEDIA_SERVICE_URL ?? 'http://localhost:3004').replace(/\/$/, '');
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const DRY_RUN = process.argv.includes('--dry-run');
const RETRY_REFUSED = process.argv.includes('--retry-refused');
const ONLY_ATOM = argValue('--atom');
const CONCURRENCY = Math.max(1, Number(argValue('--concurrency') ?? 1));
const PAUSE_MS = Math.max(0, Number(argValue('--pause-ms') ?? 6_000));
/** How often a 503 word is asked again in this run, and how long it waits first (breaker 30 s). */
const RETRIES = 3;
const RETRY_WAIT_MS = 60_000;

const READY_TIMEOUT_MS = 120_000;
const POLL_MS = 2_000;

/** Why the drill needs the word; the order is the order of asking — the cold start comes first. */
const ROLES = ['diagnostic', 'word', 'pair', 'phrase'] as const;
type Role = (typeof ROLES)[number];

interface Wanted {
  language: string;
  /** The key of `sound_reference_clips` and what is asked: the word in lower case. */
  word: string;
  role: Role;
  atoms: Set<string>;
}

interface Clip {
  assetId: string;
  voice: string;
  tone: 1 | 2 | null;
  cached: boolean;
}

type Asked =
  | { kind: 'clip'; clip: Clip }
  | { kind: 'refused'; code: string }
  | { kind: 'later'; code: string };

function argValue(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const keyOf = (word: string): string => word.trim().toLowerCase();

function pairsOf(json: unknown): Array<[string, string]> {
  return Array.isArray(json)
    ? json.filter((p): p is [string, string] => Array.isArray(p) && p.length === 2)
    : [];
}

function carriersOf(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((p: { carriers?: unknown }) =>
    Array.isArray(p?.carriers) ? p.carriers.filter((c): c is string => typeof c === 'string') : [],
  );
}

async function wantedWords(): Promise<Wanted[]> {
  const rows = await prisma.soundAtom.findMany({
    where: { scored: true, ...(ONLY_ATOM ? { id: ONLY_ATOM } : {}) },
    orderBy: [{ language: 'asc' }, { position: 'asc' }],
    include: { drill: true },
  });
  if (ONLY_ATOM && rows.length === 0) throw new Error(`no scored sound atom ${ONLY_ATOM}`);

  const wanted = new Map<string, Wanted>();
  const add = (language: string, atom: string, raw: string, role: Role) => {
    const word = keyOf(raw);
    const id = `${language}:${word}`;
    const known = wanted.get(id);
    if (known) {
      known.atoms.add(atom);
      // A word needed by the cold start is asked first, whatever else it is.
      if (ROLES.indexOf(role) < ROLES.indexOf(known.role)) known.role = role;
      return;
    }
    wanted.set(id, { language, word, role, atoms: new Set([atom]) });
  };

  for (const row of rows) {
    if (!row.drill) {
      console.warn(`  ! ${row.id}: no drill material — run seed-sound-atoms.ts first`);
      continue;
    }
    add(row.language, row.id, row.drill.diagnostic, 'diagnostic');
    row.drill.words.forEach((w) => add(row.language, row.id, w, 'word'));
    pairsOf(row.drill.pairs)
      .flat()
      .forEach((w) => add(row.language, row.id, w, 'pair'));
    carriersOf(row.drill.phrases).forEach((w) => add(row.language, row.id, w, 'phrase'));
  }
  return [...wanted.values()].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
}

async function media(path: string, body: unknown): Promise<Response> {
  return fetch(`${MEDIA_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-token': TOKEN },
    body: JSON.stringify(body),
  });
}

/** Nest's error body carries the code as `message`. */
async function codeOf(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
  } catch {
    /* not JSON — fall through */
  }
  return `HTTP_${res.status}`;
}

async function ask(w: Wanted): Promise<Asked> {
  const res = await media('/api/v1/internal/media/pronunciation/reference', {
    text: w.word,
    lang: w.language,
  });
  if (res.ok) return { kind: 'clip', clip: (await res.json()) as Clip };
  if (res.status === 401) throw new Error('media-service refused the token (401) — check INTERNAL_SERVICE_TOKEN');
  if (res.status === 422) return { kind: 'refused', code: await codeOf(res) };
  if (res.status === 503) return { kind: 'later', code: await codeOf(res) };
  throw new Error(`reference of «${w.word}» → ${res.status} ${await res.text()}`);
}

async function record(w: Wanted, asked: Asked): Promise<void> {
  if (asked.kind === 'later') return;
  const data =
    asked.kind === 'clip'
      ? { assetId: asked.clip.assetId, tone: asked.clip.tone, refusal: null }
      : { assetId: null, tone: null, refusal: asked.code.slice(0, 32) };
  await prisma.soundReferenceClip.upsert({
    where: { language_word: { language: w.language, word: w.word } },
    create: { language: w.language, word: w.word, ...data, checkedAt: new Date() },
    update: { ...data, checkedAt: new Date() },
  });
}

/** Ids among `ids` that are not READY once processing has had its time; FAILED ones at once. */
async function notReady(ids: string[]): Promise<string[]> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let waiting = ids;
  while (waiting.length > 0) {
    const still: string[] = [];
    const failed: string[] = [];
    for (let at = 0; at < waiting.length; at += 100) {
      const res = await media('/api/v1/internal/media/assets/describe', { ids: waiting.slice(at, at + 100) });
      if (!res.ok) throw new Error(`describe → ${res.status} ${await res.text()}`);
      const described = (await res.json()) as Array<{ id: string; status: string }>;
      const seen = new Set(described.map((d) => d.id));
      for (const d of described) {
        if (d.status === 'FAILED' || d.status === 'DELETED') failed.push(`${d.id} (${d.status})`);
        else if (d.status !== 'READY') still.push(d.id);
      }
      waiting.slice(at, at + 100).forEach((id) => {
        if (!seen.has(id)) failed.push(`${id} (missing)`);
      });
    }
    if (still.length === 0) return failed;
    if (Date.now() > deadline) return [...failed, ...still.map((id) => `${id} (not READY)`)];
    waiting = still;
    await sleep(POLL_MS);
  }
  return [];
}

async function main(): Promise<void> {
  if (!TOKEN) throw new Error('INTERNAL_SERVICE_TOKEN is not set');
  const wanted = await wantedWords();

  const rows = await prisma.soundReferenceClip.findMany({
    where: { OR: [...new Set(wanted.map((w) => w.language))].map((language) => ({ language })) },
  });
  const known = new Map(rows.map((r) => [`${r.language}:${r.word}`, r]));
  const todo = wanted.filter((w) => {
    const row = known.get(`${w.language}:${w.word}`);
    if (!row) return true;
    return RETRY_REFUSED && row.assetId === null;
  });

  const byRole = (list: Wanted[]) =>
    ROLES.map((r) => `${r} ${list.filter((w) => w.role === r).length}`).join(', ');
  console.log(`${wanted.length} word(s) in the drill (${byRole(wanted)}); ${todo.length} to ask (${byRole(todo)})`);
  if (DRY_RUN) {
    todo.forEach((w) => console.log(`  · ${w.language}:${w.word} — ${w.role}, ${[...w.atoms].join(' ')}`));
    return;
  }

  const made: string[] = [];
  const refused = new Map<string, string[]>();
  const later: string[] = [];
  let reused = 0;
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < todo.length) {
      const w = todo[next++]!;
      let asked = await ask(w);
      for (let retry = 1; asked.kind === 'later' && retry <= RETRIES; retry += 1) {
        console.log(`  … ${w.language}:${w.word}: ${asked.code}, again in ${RETRY_WAIT_MS / 1000} s (${retry}/${RETRIES})`);
        await sleep(RETRY_WAIT_MS);
        asked = await ask(w);
      }
      await record(w, asked);
      done += 1;
      const tag = `[${done}/${todo.length}] ${w.language}:${w.word} (${w.role})`;
      if (asked.kind === 'clip') {
        if (asked.clip.cached) reused += 1;
        else made.push(asked.clip.assetId);
        console.log(
          `  ✓ ${tag}: ${asked.clip.voice}, toneme ${asked.clip.tone ?? '–'}${asked.clip.cached ? ' (stored)' : ''}`,
        );
      } else if (asked.kind === 'refused') {
        refused.set(asked.code, [...(refused.get(asked.code) ?? []), w.word]);
        console.log(`  ✗ ${tag}: ${asked.code} — ${[...w.atoms].join(' ')}`);
      } else {
        later.push(w.word);
        console.log(`  … ${tag}: ${asked.code}, left for the next run`);
      }
      // A stored clip cost nothing; only a made one or a refusal after synthesis spent Azure calls.
      if (!(asked.kind === 'clip' && asked.clip.cached) && next < todo.length) await sleep(PAUSE_MS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));

  const unready = made.length > 0 ? await notReady(made) : [];
  console.log(`${made.length} clip(s) made, ${reused} already stored, ${later.length} to ask again later`);
  for (const [code, words] of refused) console.log(`  refused ${code}: ${words.join(', ')}`);
  if (unready.length > 0) console.log(`  not READY: ${unready.join(', ')}`);
  if (later.length > 0) process.exitCode = 2;
}

main()
  .catch((err) => {
    console.error('Reference clips failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
