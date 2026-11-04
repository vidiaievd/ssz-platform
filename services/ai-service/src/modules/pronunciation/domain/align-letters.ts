import { parseNofabet, soundOf, type NofabetToken, type Stress } from './sound-inventory.js';

/**
 * A word's written letters laid over the sounds of one lexicon transcription (plan 86, step
 * 6d, §4i.1): which letters are said, which are silent, which sit together in one sound. The
 * shape of the kernel's `SoundSeg` (`prosody/sounds.ts`) — ai-service does not import the
 * kernel, so the two are kept in step by hand and by content-service's contract test.
 */
export interface LetterSeg {
  /** Character offsets in the word as written, `e` exclusive; `s === e` for a sound never written. */
  s: number;
  e: number;
  kind: 'vowel' | 'consonant' | 'silent';
  /** NoFAbet symbols heard here, no stress digits. */
  sounds: string[];
  stress: Stress | null;
  /** Vowels only. */
  long: boolean | null;
  /** Several letters read as one sound. */
  tie: boolean;
}

type Step = { letters: string; sounds: string[]; kind: StepKind };
type StepKind = 'vowel' | 'syllabic' | 'consonant' | 'silent' | 'silent_vowel' | 'inserted';

const VOWEL_LETTERS = new Set([...'aeiouyæøå']);
const DIPHTHONG_LETTERS = new Set(['ei', 'øy', 'au', 'ai', 'oi', 'øi', 'ey', 'ay']);
/** Consonant letters that may be written and not said: *med*, *godt*, *og*, *hva*, *selv*. */
const SILENT_OK = new Set([...'dtghv']);

/**
 * Syllabic consonant → the letters it may be written with after an *e* (*hesten*, *morgen*,
 * *døren*: *rn*; *kippersen*, *spurten*: the r already sits in the retroflex before it, so *n*).
 */
const SYLLABIC: Readonly<Record<string, readonly string[]>> = {
  NX: ['n'],
  LX: ['l'],
  RNX: ['r', 'n'],
  RLX: ['r', 'l'],
};

/** Retroflex sounds: an *r* written before one of them is already in it (*fjorden* `OO3 RNX0`). */
const RETROFLEX = new Set(['RS', 'RT', 'RD', 'RN', 'RL', 'RNX', 'RLX']);

/**
 * Letters read as one sound or a pair, free of cost. A letter group may be read in several ways
 * (*sk* → ʃ in *ski*, s k in *skole*): every reading is a row; the transcription picks one.
 * Found on 5 000 random word forms of NB Uttale østnorsk (04.11): the table, the costs below and
 * the three additions of this step (`rst`, `-eren`, `sl`) align 9 of 10 words.
 */
const CHUNKS: Readonly<Record<string, string[][]>> = {
  skj: [['SJ']],
  sj: [['SJ']],
  sk: [['SJ'], ['S', 'K']],
  kj: [['KJ']],
  tj: [['KJ']],
  tsj: [['KJ']],
  gj: [['J']],
  hj: [['J']],
  lj: [['J'], ['L', 'J']],
  hv: [['V']],
  ng: [['NG'], ['NG', 'G']],
  nk: [['NG', 'K']],
  nn: [['NG']],
  ns: [['NG', 'S']],
  gn: [['NG', 'N']],
  gt: [['K', 'T']],
  eg: [['AEJ']],
  rs: [['RS']],
  rt: [['RT']],
  rd: [['RD'], ['R'], ['R', 'D']],
  rn: [['RN'], ['RN', 'RNX']],
  rl: [['RL']],
  rg: [['R'], ['R', 'J']],
  ld: [['L']],
  nd: [['N']],
  rst: [['RS', 'RT']],
  rsj: [['RS'], ['SJ']],
  rsl: [['RS', 'RL']],
  sl: [['SJ', 'L'], ['S', 'L']],
  ren: [['RNX'], ['RN']],
  rnen: [['RN', 'NX']],
  ch: [['T', 'SJ'], ['SJ'], ['KJ'], ['K']],
  th: [['T']],
  ph: [['F']],
  ds: [['SJ'], ['T', 'S']],
  dk: [['T', 'K']],
  gs: [['K', 'S']],
  x: [['K', 'S']],
  z: [['T', 'S'], ['S']],
  c: [['S'], ['K']],
  q: [['K']],
  w: [['V']],
  g: [['G'], ['J'], ['SJ']],
  k: [['K'], ['KJ']],
  // A retroflex is written with the letters of the plain sound, after an r that is silent or one.
  s: [['RS']],
  t: [['RT']],
  d: [['RD']],
  n: [['NG'], ['RN']],
  l: [['RL']],
};

/** A consonant letter read as the sound of its own name. */
const SAME: Readonly<Record<string, string>> = Object.fromEntries([...'bdfhjklmnprstv'].map((c) => [c, c.toUpperCase()]));

/** Letter groups that are one sound by writing, for `tie`: the kinds that the table marks, minus doubles. */
function isTied(letters: string, sounds: readonly string[]): boolean {
  return letters.length > 1 && sounds.length === 1 && letters[0] !== letters[1];
}

interface Path {
  cost: number;
  steps: Step[];
}

/**
 * The cheapest way to read `word`'s letters as the transcription's sounds. Each step eats 1–3
 * letters and 0–2 sounds: a vowel letter or two for a vowel sound, a letter group from
 * `CHUNKS`, a doubled consonant for one sound, a silent consonant (cheap for *d t g h v*), a
 * silent vowel (dear — a signal that the alignment is wrong), a schwa the spelling does not
 * write (dear). Returns null when no path reaches the end.
 */
function cheapestPath(word: string, sounds: readonly NofabetToken[]): Path | null {
  const memo = new Map<number, Path | null>();
  const n = word.length;
  const m = sounds.length;
  const key = (i: number, j: number) => i * (m + 1) + j;

  const best = (i: number, j: number): Path | null => {
    if (i === n && j === m) return { cost: 0, steps: [] };
    const hit = memo.get(key(i, j));
    if (hit !== undefined) return hit;

    let winner = null as Path | null;
    const add = (di: number, dj: number, cost: number, kind: StepKind) => {
      if (i + di > n || j + dj > m) return;
      const rest = best(i + di, j + dj);
      if (!rest) return;
      const total = cost + rest.cost;
      if (winner === null || total < winner.cost) {
        winner = {
          cost: total,
          steps: [
            { letters: word.slice(i, i + di), sounds: sounds.slice(j, j + dj).map((t) => t.symbol), kind },
            ...rest.steps,
          ],
        };
      }
    };

    const ch = word[i] ?? '';
    const next = sounds[j]?.symbol;
    const entry = next ? soundOf(next) : null;

    if (VOWEL_LETTERS.has(ch)) {
      for (const di of [1, 2]) {
        const seg = word.slice(i, i + di);
        if (![...seg].every((c) => VOWEL_LETTERS.has(c))) continue;
        if (entry && (entry.kind === 'vowel' || entry.kind === 'diphthong')) {
          const written = DIPHTHONG_LETTERS.has(word.slice(i, i + 2));
          const cost =
            di === 1 ? (entry.kind === 'diphthong' && written ? 0.3 : 0) : written ? 0 : 0.5;
          add(di, 1, cost, 'vowel');
        }
        // *e* + *n* read as a syllabic n: the e is written and not heard.
        if (next && next in SYLLABIC && di === 1) {
          const after = word.slice(i + 1, i + 2);
          const wantsRn = next === 'RNX' && word.slice(i + 1, i + 3) === 'rn';
          if (wantsRn) add(3, 1, 0, 'syllabic');
          else if (after !== '' && SYLLABIC[next]!.includes(after)) add(2, 1, 0, 'syllabic');
        }
      }
      // A lost schwa the spelling still writes before a closing *n*, *l*, *r* (*kjøkken* `K N`).
      if (ch === 'e' && /^e[nlr]s?$/.test(word.slice(i)) && entry?.kind === 'consonant') add(1, 0, 2.5, 'silent');
      add(1, 0, 5, 'silent_vowel');
    }
    if (next && next in SYLLABIC && SYLLABIC[next]!.includes(ch)) add(1, 1, 0.2, 'syllabic');

    for (const k of [3, 2, 1]) {
      const letters = word.slice(i, i + k);
      if (letters.length !== k) continue;
      for (const reading of CHUNKS[letters] ?? []) {
        if (reading.every((sym, d) => sounds[j + d]?.symbol === sym)) {
          // A single letter read as anything but its own sound is legal, not the plain reading.
          const cost = k === 1 && reading[0] !== SAME[letters] && reading[0] !== letters.toUpperCase() ? 0.1 : 0;
          add(k, reading.length, cost, 'consonant');
        }
      }
    }
    if (ch in SAME && next === SAME[ch]) {
      add(1, 1, 0, 'consonant');
      if (word[i + 1] === ch) add(2, 1, 0, 'consonant');
    }
    if (next === 'AX') add(0, 1, 3, 'inserted');
    if (ch !== '' && !VOWEL_LETTERS.has(ch)) {
      const absorbed = ch === 'r' && next !== undefined && RETROFLEX.has(next);
      add(1, 0, absorbed ? 1 : SILENT_OK.has(ch) ? 1.5 : 4, 'silent');
    }

    memo.set(key(i, j), winner);
    return winner;
  };

  return best(0, 0);
}

/** Letters inside a group that are not heard, by the group and the sound read for it. */
function silentIn(letters: string, sound: string | undefined): number[] {
  if (letters === 'ld' || letters === 'nd') return [1];
  if (letters === 'hv' || letters === 'gj' || letters === 'hj') return [0];
  if ((letters === 'rd' || letters === 'rg') && sound === 'R') return [1];
  if (letters === 'lj' && sound === 'J') return [0];
  return [];
}

/**
 * Over how many letters of a word the alignment may cost at most before it is a guess: a
 * silent vowel, or a silent consonant that is not one of *d t g h v*, is not a reading of the
 * word but a failure to read it.
 */
const MAX_COST = 4;

/**
 * The letters of `word` over the sounds of `nofabet`, or null when they cannot be laid
 * together without a guess: a path that needed a silent vowel or a costly silent consonant, a
 * transcription with a sound outside the inventory (or a word break), a word with a letter
 * outside the alphabet. A word that aligns shows its stress, its silent letters and its
 * letter groups; one that does not shows only its stressed vowel (`stressOfVariant`).
 */
export function alignLetters(word: string, nofabet: string): LetterSeg[] | null {
  const lower = word.toLowerCase();
  if (lower.length !== word.length || lower.length === 0) return null;
  const tokens = parseNofabet(nofabet);
  if (!tokens || tokens.some((t) => t.symbol === '_')) return null;
  const path = cheapestPath(lower, tokens);
  if (!path || path.cost >= MAX_COST || path.steps.some((x) => x.kind === 'silent_vowel')) return null;

  const segs: LetterSeg[] = [];
  let at = 0;
  let si = 0;
  for (const step of path.steps) {
    const len = step.letters.length;
    const first = tokens[si];
    const stress = first?.stress ?? null;
    switch (step.kind) {
      case 'silent':
        segs.push({ s: at, e: at + len, kind: 'silent', sounds: [], stress: null, long: null, tie: false });
        break;
      case 'inserted':
        segs.push({ s: at, e: at, kind: 'vowel', sounds: ['AX'], stress, long: false, tie: false });
        break;
      case 'vowel': {
        const entry = soundOf(step.sounds[0]!);
        const long = entry?.kind === 'diphthong' ? true : (entry?.long ?? false);
        segs.push({ s: at, e: at + len, kind: 'vowel', sounds: step.sounds, stress, long, tie: false });
        break;
      }
      case 'syllabic': {
        // The vowel letter before a syllabic consonant is written and not said: *hesten* = hest + n.
        const lead = len > 1 ? 1 : 0;
        if (lead) segs.push({ s: at, e: at + 1, kind: 'silent', sounds: [], stress: null, long: null, tie: false });
        const rest = len - lead;
        segs.push({
          s: at + lead,
          e: at + len,
          kind: 'consonant',
          sounds: step.sounds,
          stress,
          long: null,
          tie: rest > 1,
        });
        break;
      }
      default: {
        // Letters that are consonants in writing and a vowel in sound (*eg* → æi).
        const heard = step.sounds.length === 1 ? soundOf(step.sounds[0]!) : null;
        if (heard && (heard.kind === 'vowel' || heard.kind === 'diphthong')) {
          const long = heard.kind === 'diphthong' ? true : (heard.long ?? false);
          segs.push({ s: at, e: at + len, kind: 'vowel', sounds: step.sounds, stress, long, tie: len > 1 });
          break;
        }
        const hushed = silentIn(step.letters, step.sounds[0]);
        if (hushed.length > 0) {
          for (let p = 0; p < len; p++) {
            const silent = hushed.includes(p);
            segs.push({
              s: at + p,
              e: at + p + 1,
              kind: silent ? 'silent' : 'consonant',
              sounds: silent ? [] : step.sounds,
              stress: null,
              long: null,
              tie: false,
            });
          }
        } else {
          segs.push({
            s: at,
            e: at + len,
            kind: 'consonant',
            sounds: step.sounds,
            stress: null,
            long: null,
            tie: isTied(step.letters, step.sounds),
          });
        }
      }
    }
    at += len;
    si += step.sounds.length;
  }
  return segs;
}
