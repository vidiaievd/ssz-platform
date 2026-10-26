// The machine's reading check for a `read_aloud` recording (plan 82, decisions Q4 and Q7).
//
// A speech recognizer hears the recording and returns the words it heard; this file decides,
// against the passage the student was given, which words were read. Nothing here listens: the
// recognizer runs in ai-service, and the engine calls these functions on what it returns — the
// machine check decides, the model only reports what it heard (the spirit of Q4-C, plan 79).
//
// The rules, decided 25.10:
//
//   1. **Only `read`.** A monologue or a dialogue has no passage to check against; they keep
//      `NO_REVIEWER` without a school (Q7).
//   2. **Accuracy = passage words read / passage words.** Both sides go through the kernel
//      tokenizer and are compared lower-cased; an LCS alignment pairs what was heard with what
//      was written. A passage word with nothing heard for it is **missed**; one heard as another
//      word is **misread**. Both count against the reader.
//   3. **Extra words do not count.** A repeated word or a self-correction («i går — i morgen»)
//      is how people read aloud, not an error (Q4). They are reported, not charged.
//   4. **The recognizer's spelling is not the reader's.** A compound heard as two words
//      (`e-post` → `e post`), two words heard as one, and a number heard as digits (`tre` → `3`)
//      count as read. Those are the recognizer's writing habits; charging them would fail a
//      learner for the software's orthography.
//   5. **A prompt passes at `readingPassPercent`** of its words (default 85, the author's field,
//      decided in whole numbers); the work passes when every prompt does — the same shape as the
//      teacher's verdict (plan 70, Q1-A). The attempt's score is the mean accuracy.
//   6. **Focus words are feedback.** A missed or misread focus word is flagged for the learner;
//      the verdict does not read it (Q4).
//
// Pronunciation scores (Azure Pronunciation Assessment, the premium tier) never reach this file:
// they are feedback only until the gate shows they agree with teachers (plan 82 §2.3, Q1).

import { tokenize } from '../text/words.js';
import { wordKey } from './derive.js';
import type { Prompt, ReadAloudContent } from './model.js';
import { DEFAULT_REVIEW } from './model.js';

/** The pass mark when the author has not set one, in percent of a prompt's words. */
export const DEFAULT_READING_PASS_PERCENT = DEFAULT_REVIEW.readingPassPercent;
/** Below this the check passes mumbling; the builder does not offer less. */
export const MIN_READING_PASS_PERCENT = 50;
export const MAX_READING_PASS_PERCENT = 100;

/** A passage word heard as written. `heard` — as the recognizer wrote it. */
export interface ReadOp {
  k: 'read';
  /** Index of the passage word. */
  i: number;
  /** Passage words it covers — more than one when the recognizer glued them. */
  n: number;
  heard: string;
  focus: boolean;
}

/** A passage word heard as another word. */
export interface MisreadOp {
  k: 'misread';
  i: number;
  expected: string;
  heard: string;
  focus: boolean;
}

/** A passage word with nothing heard for it. */
export interface MissedOp {
  k: 'missed';
  i: number;
  expected: string;
  focus: boolean;
}

/** A word heard that is not in the passage — a repeat, a self-correction, a filler. */
export interface ExtraOp {
  k: 'extra';
  heard: string;
}

export type ReadingOp = ReadOp | MisreadOp | MissedOp | ExtraOp;

export interface ReadingCheck {
  /** In passage order; extra words sit where they were heard. */
  ops: ReadingOp[];
  /** Passage words. */
  total: number;
  read: number;
  misread: number;
  missed: number;
  extra: number;
  /** `read / total`, 0..1; 0 for an empty passage. */
  accuracy: number;
}

/** Longest run of passage words a recognizer may glue into one (`i morgen tidlig`). */
const GLUE_MAX = 3;

/**
 * Number words a recognizer may write as digits — `nb` only for now; another language's table
 * is content to add, not code to change. `1` has two readings in Bokmål (`en` / `ett`).
 */
const NUMBER_WORDS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  nb: {
    '0': ['null'],
    '1': ['en', 'ett', 'én'],
    '2': ['to'],
    '3': ['tre'],
    '4': ['fire'],
    '5': ['fem'],
    '6': ['seks'],
    '7': ['sju', 'syv'],
    '8': ['åtte'],
    '9': ['ni'],
    '10': ['ti'],
    '11': ['elleve'],
    '12': ['tolv'],
    '13': ['tretten'],
    '14': ['fjorten'],
    '15': ['femten'],
    '16': ['seksten'],
    '17': ['sytten'],
    '18': ['atten'],
    '19': ['nitten'],
    '20': ['tjue', 'tyve'],
    '30': ['tretti', 'tredve'],
    '40': ['førti'],
    '50': ['femti'],
    '60': ['seksti'],
    '70': ['sytti'],
    '80': ['åtti'],
    '90': ['nitti'],
    '100': ['hundre'],
    '1000': ['tusen'],
  },
};

interface Word {
  i: number;
  w: string;
  key: string;
}

function words(text: string): Word[] {
  return tokenize(text).map((t) => ({ i: t.i, w: t.w, key: wordKey(t.w) }));
}

/** Whether a heard word stands for a passage word — the same key, or a number as digits. */
function same(passage: Word, heard: Word, numbers: Readonly<Record<string, readonly string[]>>): boolean {
  if (passage.key === heard.key) return true;
  return (
    (numbers[heard.key]?.includes(passage.key) ?? false) ||
    (numbers[passage.key]?.includes(heard.key) ?? false)
  );
}

type Raw = { k: 'eq'; e: Word; g: Word } | { k: 'del'; e: Word } | { k: 'ins'; g: Word };

/** LCS alignment; a tie prefers a deletion, so the same two strings align alike everywhere. */
function align(E: readonly Word[], G: readonly Word[], numbers: Readonly<Record<string, readonly string[]>>): Raw[] {
  const n = E.length;
  const m = G.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i]![j] = same(E[i]!, G[j]!, numbers)
        ? L[i + 1]![j + 1]! + 1
        : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
    }
  }
  const raw: Raw[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(E[i]!, G[j]!, numbers)) {
      raw.push({ k: 'eq', e: E[i]!, g: G[j]! });
      i++;
      j++;
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) {
      raw.push({ k: 'del', e: E[i++]! });
    } else {
      raw.push({ k: 'ins', g: G[j++]! });
    }
  }
  while (i < n) raw.push({ k: 'del', e: E[i++]! });
  while (j < m) raw.push({ k: 'ins', g: G[j++]! });
  return raw;
}

/** Keys glued without what stood between them — `e-post` and `e post` both read `epost`. */
const glued = (ws: readonly Word[]): string => ws.map((w) => w.key.replace(/[-'’]/g, '')).join('');

/** 2–3 passage words heard as one, or one heard as 2–3, starting at this point of the seam. */
function glueAt(dels: readonly Word[], p: number, inss: readonly Word[], q: number): { dn: number; gn: number } | null {
  if (glued([dels[p]!]) === glued([inss[q]!])) return { dn: 1, gn: 1 };
  for (let n = 2; n <= GLUE_MAX; n++) {
    if (p + n <= dels.length && glued(dels.slice(p, p + n)) === glued([inss[q]!])) return { dn: n, gn: 1 };
    if (q + n <= inss.length && glued(inss.slice(q, q + n)) === glued([dels[p]!])) return { dn: 1, gn: n };
  }
  return null;
}

/**
 * Checks what the recognizer heard against the passage of one prompt.
 *
 * @param passage the prompt's text, as the student saw it
 * @param heard the recognizer's words, as one string (its lexical form when it offers one)
 * @param language the course language — picks the number words
 * @param focus the prompt's focus words, flagged in the ops for feedback
 */
export function checkReading(
  passage: string,
  heard: string,
  language: string,
  focus: readonly Pick<Prompt['focus'][number], 'word'>[] = [],
): ReadingCheck {
  const numbers = NUMBER_WORDS[language] ?? {};
  const focusKeys = new Set(focus.map((f) => wordKey(f.word)));
  const E = words(passage);
  const G = words(heard);
  const isFocus = (w: Word) => focusKeys.has(w.key);

  const ops: ReadingOp[] = [];
  const raw = align(E, G, numbers);
  let x = 0;
  while (x < raw.length) {
    const o = raw[x]!;
    if (o.k === 'eq') {
      ops.push({ k: 'read', i: o.e.i, n: 1, heard: o.g.w, focus: isFocus(o.e) });
      x++;
      continue;
    }

    // One seam: everything up to the next match.
    const dels: Word[] = [];
    const inss: Word[] = [];
    while (x < raw.length && raw[x]!.k !== 'eq') {
      const r = raw[x]!;
      if (r.k === 'del') dels.push(r.e);
      else if (r.k === 'ins') inss.push(r.g);
      x++;
    }

    let p = 0;
    let q = 0;
    while (p < dels.length && q < inss.length) {
      const glue = glueAt(dels, p, inss, q);
      if (glue !== null) {
        const covered = dels.slice(p, p + glue.dn);
        ops.push({
          k: 'read',
          i: covered[0]!.i,
          n: covered.length,
          heard: inss.slice(q, q + glue.gn).map((w) => w.w).join(' '),
          focus: covered.some(isFocus),
        });
        p += glue.dn;
        q += glue.gn;
        continue;
      }
      const e = dels[p++]!;
      ops.push({ k: 'misread', i: e.i, expected: e.w, heard: inss[q++]!.w, focus: isFocus(e) });
    }
    for (; p < dels.length; p++) {
      const e = dels[p]!;
      ops.push({ k: 'missed', i: e.i, expected: e.w, focus: isFocus(e) });
    }
    for (; q < inss.length; q++) ops.push({ k: 'extra', heard: inss[q]!.w });
  }

  const check: ReadingCheck = { ops, total: E.length, read: 0, misread: 0, missed: 0, extra: 0, accuracy: 0 };
  for (const op of ops) {
    if (op.k === 'read') check.read += op.n;
    else if (op.k === 'misread') check.misread++;
    else if (op.k === 'missed') check.missed++;
    else check.extra++;
  }
  check.accuracy = check.total === 0 ? 0 : check.read / check.total;
  return check;
}

/** The pass mark of a document, kept inside the range the builder offers. */
export function readingPassPercent(ex: Pick<ReadAloudContent, 'review'>): number {
  return clampPassPercent(ex.review.readingPassPercent);
}

export function clampPassPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_READING_PASS_PERCENT;
  return Math.min(MAX_READING_PASS_PERCENT, Math.max(MIN_READING_PASS_PERCENT, Math.round(value)));
}

/** Whether a prompt's check reaches the pass mark — in whole numbers, never on a float. */
export function readingPasses(check: Pick<ReadingCheck, 'read' | 'total'>, passPercent: number): boolean {
  return check.total > 0 && check.read * 100 >= clampPassPercent(passPercent) * check.total;
}

/** A prompt's accuracy as the learner sees it — whole percent, rounded down so 84.9 never shows 85. */
export function accuracyPercent(check: Pick<ReadingCheck, 'read' | 'total'>): number {
  return check.total === 0 ? 0 : Math.floor((check.read * 100) / check.total);
}

export interface PromptReading {
  itemId: string;
  check: ReadingCheck;
}

export interface ReadingVerdict {
  prompts: Array<{ itemId: string; passed: boolean; percent: number }>;
  /** Every prompt passed. False for an empty list: nothing was checked. */
  passed: boolean;
  /** The mean accuracy over the prompts, whole percent — the attempt's score (Q4). */
  score: number;
}

/**
 * The machine's verdict over the prompts it checked. The caller passes the prompts recorded in
 * this try only: a prompt carried from a returned try (plan 70, phase 11b) keeps the teacher's
 * ruling and is not checked again.
 */
export function readingVerdict(readings: readonly PromptReading[], passPercent: number): ReadingVerdict {
  const prompts = readings.map((r) => ({
    itemId: r.itemId,
    passed: readingPasses(r.check, passPercent),
    percent: accuracyPercent(r.check),
  }));
  const read = readings.reduce((n, r) => n + (r.check.total === 0 ? 0 : r.check.read / r.check.total), 0);
  return {
    prompts,
    passed: prompts.length > 0 && prompts.every((p) => p.passed),
    score: readings.length === 0 ? 0 : Math.floor((read * 100) / readings.length),
  };
}

/**
 * Words per minute over the speech the recognizer heard — fluency feedback (`review.ai.fluency`),
 * never part of the verdict. Null when the recognizer reported no speech time.
 */
export function wordsPerMinute(heardWords: number, speechSeconds: number): number | null {
  if (!(speechSeconds > 0) || heardWords <= 0) return null;
  return Math.round((heardWords * 60) / speechSeconds);
}

/**
 * Whether the machine may check this exercise at all: the author turned the AI stage on with the
 * transcript check, the mode is `read`, and every prompt carries a passage. The engine asks this
 * at hand-in before it asks the learner's plan (plan 82, step 6).
 */
export function machineCanCheck(ex: Pick<ReadAloudContent, 'mode' | 'prompts' | 'review'>): boolean {
  return (
    ex.mode === 'read' &&
    ex.review.aiStage &&
    ex.review.ai.transcript &&
    ex.prompts.length > 0 &&
    ex.prompts.every((p) => tokenize(p.text).length > 0)
  );
}
