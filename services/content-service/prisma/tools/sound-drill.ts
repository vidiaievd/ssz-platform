/**
 * Drill material of the scored sounds checked against the pronunciation lexicon, and the course's
 * short lines picked as phrases (plan 86, step 13.2).
 *
 * 1. Every word of prisma/data/sound-atom-drill.ts is asked of ai-service's lexicon
 *    (`POST internal/prosody/word-stresses`) inside the reference frame «Nå sier jeg … igjen.»: it must be there and hold a sound its family is scored
 *    on in a single word — on a stressed vowel, or a consonant anywhere. Pairs: a length pair is a
 *    long scored vowel against a short one; a toneme pair is toneme 1 against toneme 2. The
 *    diagnostic word must pass the same check. Then every word is asked of the checks a reference
 *    clip makes before synthesis (`POST internal/reference-clips/check`, step 13.2c): the frame
 *    narrows a homograph to one reading, but the clip is made of the word alone, by all its variants,
 *    so a word whose variants differ in toneme (*sola*, *huset*) gets no clip and is refused here.
 *    Any miss fails the run (exit 1) and names the word. Whether a voice passes the clip's
 *    self-check (`REFERENCE_REJECTED`) shows only when reference-sound-atoms.ts synthesizes it.
 * 2. Phrases: the sentences of the «Norsk uttale» `read_aloud` prompts (mode `read`) of the
 *    exercises that target the family, 3–8 words, starting with a capital. A line is kept when the
 *    lexicon finds in it a sound the family is scored on in running speech; those words are its
 *    `carriers` — what the session asks the measurement about (step 13.3). Lines with more carriers
 *    first, then shorter, then in course order; at most PHRASES_PER_ATOM. Written to
 *    prisma/data/sound-drill-phrases.json, which the seed reads — the lexicon is not asked at seed time.
 *
 * Run from services/content-service with ai-service up (the dev stack):
 *   npx tsx prisma/tools/sound-drill.ts          # check the words, rewrite the phrases file
 *   npx tsx prisma/tools/sound-drill.ts --check  # check the words, fail if the phrases file is stale
 *
 * Env: INTERNAL_SERVICE_TOKEN; AI_SERVICE_URL (default http://localhost:3010).
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenize } from '@ssz/shared-kernel/text';
import { SOUND_ATOMS, soundAtomKey } from '../data/sound-atoms.js';
import {
  PHRASE_MAX_WORDS,
  PHRASES_PER_ATOM,
  SOUND_ATOM_DRILL,
  type SoundAtomDrill,
} from '../data/sound-atom-drill.js';

const AI_URL = (process.env.AI_SERVICE_URL ?? 'http://localhost:3010').replace(/\/$/, '');
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const CHECK_ONLY = process.argv.includes('--check');

const DATA_DIR = join(process.cwd(), 'prisma', 'data');
const COURSE_FILE = join(DATA_DIR, 'norsk-uttale', 'exercises.json');
export const PHRASES_FILE = join(DATA_DIR, 'sound-drill-phrases.json');

const PHRASE_MIN_WORDS = 3;

/** The carrier sentence of media-service's reference clips (plan 88): «Nå sier jeg … igjen.» */
const FRAME_BEFORE = 'Nå sier jeg ';
const FRAME_AFTER = ' igjen.';
const FRAME_INDEX = 3;

interface Seg {
  kind: 'vowel' | 'consonant' | 'silent';
  sounds: string[];
  stress: number | null;
  long: boolean | null;
}

interface LexiconWord {
  word: string;
  toneme: 1 | 2 | null;
  /** Null when the lexicon could not lay the word's letters over its sounds. */
  segs: Seg[] | null;
}

export interface DrillPhrase {
  text: string;
  carriers: string[];
  /** `<exercise key>:<prompt id>` of the course line. */
  source: string;
}

/** The lexicon's reading of each word of `text`, in order. */
async function lexicon(text: string): Promise<LexiconWord[]> {
  const tokens = tokenize(text);
  const res = await fetch(`${AI_URL}/api/v1/internal/prosody/word-stresses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-token': TOKEN },
    body: JSON.stringify({ language: 'nb', text, spans: tokens.map((t) => [t.s, t.e]) }),
  });
  if (!res.ok) throw new Error(`ai-service answered HTTP ${res.status} for "${text}"`);
  const body = (await res.json()) as {
    words: Array<{ index: number; toneme: 1 | 2 | null }>;
    sounds: Array<{ index: number; segs: Seg[] }>;
  };
  return tokens.map((token, index) => ({
    word: token.w,
    toneme: body.words.find((w) => w.index === index)?.toneme ?? null,
    segs: body.sounds.find((s) => s.index === index)?.segs ?? null,
  }));
}

interface ReferenceCheck {
  word: string;
  status: 'ok' | 'refused';
  reason?: string;
}

/** The reference clip's checks before synthesis, by word (lower case, as the clip is keyed). */
async function referenceChecks(words: readonly string[]): Promise<Map<string, ReferenceCheck>> {
  const asked = [...new Set(words.map((w) => w.toLowerCase()))];
  const res = await fetch(`${AI_URL}/api/v1/internal/reference-clips/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-token': TOKEN },
    body: JSON.stringify({ language: 'nb', words: asked }),
  });
  if (!res.ok) throw new Error(`ai-service answered HTTP ${res.status} for the reference check`);
  const body = (await res.json()) as { words: ReferenceCheck[] };
  return new Map(body.words.map((c) => [c.word, c]));
}

/** A segment the family is scored on: a listed symbol, on a stressed vowel or on a consonant. */
function scoredHere(seg: Seg, symbols: readonly string[]): boolean {
  if (seg.kind === 'silent') return false;
  if (seg.kind === 'vowel' && (seg.stress ?? 0) === 0) return false;
  return seg.sounds.some((s) => symbols.includes(s));
}

const holds = (w: LexiconWord, symbols: readonly string[]): boolean =>
  (w.segs ?? []).some((seg) => scoredHere(seg, symbols));

/** The stressed vowel is short — the short member of a length pair. */
const shortStressed = (w: LexiconWord): boolean =>
  (w.segs ?? []).some((seg) => seg.kind === 'vowel' && (seg.stress ?? 0) > 0 && seg.long === false);

async function checkWords(atomId: string, drill: SoundAtomDrill): Promise<string[]> {
  const isTone = atomId.endsWith(':tone');
  const all = [...new Set([...drill.words, ...drill.pairs.flat(), drill.diagnostic])];
  // Each word in the frame its reference clip says it in: the lexicon reads homographs by context.
  const read = new Map<string, LexiconWord>();
  for (const word of all) {
    const said = (await lexicon(`${FRAME_BEFORE}${word}${FRAME_AFTER}`))[FRAME_INDEX];
    if (said) read.set(word, said);
  }
  const misses: string[] = [];
  const miss = (word: string, why: string) => misses.push(`${atomId}: «${word}» ${why}`);

  const inPairsShort = new Set(isTone ? [] : drill.pairs.map(([, short]) => short));
  for (const word of all) {
    const w = read.get(word);
    if (!w || w.segs === null) {
      miss(word, 'is not in the lexicon (or its letters do not align)');
      continue;
    }
    if (isTone) {
      if (w.toneme === null) miss(word, 'has no toneme in the lexicon');
    } else if (inPairsShort.has(word)) {
      if (!shortStressed(w))
        miss(word, 'is the short member of a pair but its stressed vowel is not short');
    } else if (!holds(w, drill.symbols.word)) {
      miss(word, `holds none of ${drill.symbols.word.join(' ')} in a scored place`);
    }
  }
  if (isTone) {
    for (const [one, two] of drill.pairs) {
      if (read.get(one)?.toneme !== 1) miss(one, 'opens a toneme pair but is not toneme 1');
      if (read.get(two)?.toneme !== 2) miss(two, 'closes a toneme pair but is not toneme 2');
    }
  }
  if (!all.includes(drill.diagnostic)) miss(drill.diagnostic, 'diagnostic word missing');

  const references = await referenceChecks(all);
  for (const word of all) {
    const checked = references.get(word.toLowerCase());
    if (checked?.status === 'refused') miss(word, `can get no reference clip: ${checked.reason}`);
  }
  return misses;
}

interface CourseLine {
  text: string;
  source: string;
  targets: string[];
  order: number;
}

function courseLines(): CourseLine[] {
  const data = JSON.parse(readFileSync(COURSE_FILE, 'utf8')) as Record<
    string,
    Array<{
      key: string;
      template: string;
      targets?: string[];
      content: { mode?: string; prompts?: Array<{ id: string; text: string }> };
    }>
  >;
  const seen = new Map<string, CourseLine>();
  let order = 0;
  for (const lesson of Object.keys(data).sort()) {
    for (const ex of data[lesson]!) {
      if (ex.template !== 'read_aloud' || ex.content.mode !== 'read') continue;
      for (const prompt of ex.content.prompts ?? []) {
        for (const line of prompt.text.split('\n')) {
          for (const raw of line.match(/[^.!?]+[.!?]+/g) ?? []) {
            const text = raw.trim();
            const words = tokenize(text).length;
            if (words < PHRASE_MIN_WORDS || words > PHRASE_MAX_WORDS) continue;
            if (!/^[A-ZÆØÅ]/.test(text)) continue;
            const known = seen.get(text);
            if (known) {
              known.targets = [...new Set([...known.targets, ...(ex.targets ?? [])])];
              continue;
            }
            seen.set(text, {
              text,
              source: `${ex.key}:${prompt.id}`,
              targets: ex.targets ?? [],
              order: order++,
            });
          }
        }
      }
    }
  }
  return [...seen.values()];
}

async function pickPhrases(): Promise<Record<string, DrillPhrase[]>> {
  const lines = courseLines();
  const read = new Map<string, LexiconWord[]>();
  for (const line of lines) read.set(line.text, await lexicon(line.text));

  const out: Record<string, DrillPhrase[]> = {};
  for (const [atomId, drill] of Object.entries(SOUND_ATOM_DRILL)) {
    if (drill.symbols.fluent.length === 0) {
      out[atomId] = [];
      continue;
    }
    const picked = lines
      .filter((line) => line.targets.includes(atomId))
      .map((line) => {
        const carriers = read
          .get(line.text)!
          .filter((w) => holds(w, drill.symbols.fluent))
          .map((w) => w.word);
        return { line, carriers: [...new Set(carriers)] };
      })
      .filter((x) => x.carriers.length > 0)
      .sort(
        (a, b) =>
          b.carriers.length - a.carriers.length ||
          tokenize(a.line.text).length - tokenize(b.line.text).length ||
          a.line.order - b.line.order,
      )
      .slice(0, PHRASES_PER_ATOM);
    out[atomId] = picked.map(({ line, carriers }) => ({
      text: line.text,
      carriers,
      source: line.source,
    }));
  }
  return out;
}

function checkCatalogue(): string[] {
  const scored = SOUND_ATOMS.filter((a) => a.scored)
    .map((a) => soundAtomKey(a.language, a.family))
    .sort();
  const drilled = Object.keys(SOUND_ATOM_DRILL).sort();
  return JSON.stringify(scored) === JSON.stringify(drilled)
    ? []
    : [`drill atoms ${drilled.join(', ')} ≠ scored atoms ${scored.join(', ')}`];
}

async function main() {
  const misses = checkCatalogue();
  for (const [atomId, drill] of Object.entries(SOUND_ATOM_DRILL)) {
    misses.push(...(await checkWords(atomId, drill)));
  }

  const phrases = await pickPhrases();
  const json = `${JSON.stringify(phrases, null, 2)}\n`;
  for (const [atomId, list] of Object.entries(phrases))
    console.log(`${atomId}: ${list.length} phrases`);

  if (CHECK_ONLY) {
    let current = '';
    try {
      current = readFileSync(PHRASES_FILE, 'utf8');
    } catch {
      /* missing = stale */
    }
    if (current !== json) misses.push('sound-drill-phrases.json is stale: run without --check');
  } else {
    writeFileSync(PHRASES_FILE, json);
    console.log(`Written ${PHRASES_FILE}`);
  }

  if (misses.length > 0) {
    console.error(`\n${misses.length} problem(s):\n${misses.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('Drill words: all in the lexicon and scored.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
