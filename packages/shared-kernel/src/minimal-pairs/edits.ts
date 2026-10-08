// The builder's mutations — every `set((e) => …)` of the prototype's steps, as pure functions.
//
// Each returns a new document and leaves the argument alone. Limits are enforced here, not in
// the buttons: at least one pair, two or three words a pair, 2–30 probes, a pass mark of 0–100.
// A refused edit returns the document unchanged.

import type {
  Clip,
  Feedback,
  MinimalPairsContent,
  Pair,
  ProbeSet,
  Provenance,
  Scoring,
  Word,
} from './model.js';
import {
  emptyClip,
  MAX_WORDS,
  MIN_WORDS,
  newPair,
  newWord,
  PROBES_INPUT_MAX,
  PROBES_INPUT_MIN,
} from './model.js';
import { filledWords } from './derive.js';

type Doc = MinimalPairsContent;

function mapPair(ex: Doc, pairId: string, f: (p: Pair) => Pair): Doc {
  return { ...ex, pairs: ex.pairs.map((p) => (p.id === pairId ? f(p) : p)) };
}

function mapWord(ex: Doc, pairId: string, wordId: string, f: (w: Word) => Word): Doc {
  return mapPair(ex, pairId, (p) => ({ ...p, words: p.words.map((w) => (w.id === wordId ? f(w) : w)) }));
}

export function setTitle(ex: Doc, title: string): Doc {
  return { ...ex, title };
}

export function setInstruction(ex: Doc, instruction: string): Doc {
  return { ...ex, instruction };
}

export function setContrast(ex: Doc, contrastId: string): Doc {
  return { ...ex, contrastId };
}

export function addPair(ex: Doc): Doc {
  return { ...ex, pairs: [...ex.pairs, newPair()] };
}

/** The last pair stays: «Delete pair» is disabled at one. */
export function removePair(ex: Doc, pairId: string): Doc {
  if (ex.pairs.length < 2) return ex;
  return { ...ex, pairs: ex.pairs.filter((p) => p.id !== pairId) };
}

/** A library pair replaces the empty ones and goes to the end (`fromLib`). Arrives without audio. */
export function insertFromLibrary(ex: Doc, words: readonly string[]): Doc {
  const pair = newPair();
  pair.words = words.slice(0, MAX_WORDS).map((t) => newWord(t));
  return { ...ex, pairs: [...ex.pairs.filter((p) => filledWords(p).length > 0), pair] };
}

/** Whether these spellings are already a pair of the set — the library's «already in the set». */
export function hasPairOf(ex: Doc, words: readonly string[]): boolean {
  const key = words.map((w) => w.trim().toLowerCase()).join('/');
  return ex.pairs.some((p) => p.words.map((w) => w.text.trim().toLowerCase()).join('/') === key);
}

export function setPairNote(ex: Doc, pairId: string, note: string): Doc {
  return mapPair(ex, pairId, (p) => ({ ...p, note }));
}

/** Choosing the exercise's own family clears the override (`v === ex.contrastId ? "" : v`). */
export function setPairContrast(ex: Doc, pairId: string, contrastId: string): Doc {
  return mapPair(ex, pairId, (p) => ({ ...p, contrastId: contrastId === ex.contrastId ? '' : contrastId }));
}

export function addWord(ex: Doc, pairId: string): Doc {
  return mapPair(ex, pairId, (p) => (p.words.length >= MAX_WORDS ? p : { ...p, words: [...p.words, newWord()] }));
}

/** «Remove word» is disabled under three: a pair keeps two rows. */
export function removeWord(ex: Doc, pairId: string, wordId: string): Doc {
  return mapPair(ex, pairId, (p) =>
    p.words.length <= MIN_WORDS ? p : { ...p, words: p.words.filter((w) => w.id !== wordId) },
  );
}

export function setWord(
  ex: Doc,
  pairId: string,
  wordId: string,
  patch: Partial<Pick<Word, 'text' | 'gloss' | 'ipa'>>,
): Doc {
  return mapWord(ex, pairId, wordId, (w) => ({ ...w, ...patch }));
}

export function setClip(ex: Doc, pairId: string, wordId: string, patch: Partial<Clip>): Doc {
  return mapWord(ex, pairId, wordId, (w) => ({ ...w, clip: { ...w.clip, ...patch } }));
}

/** «Remove clip»: the recording goes, who made it stays — the next take is likely the same voice. */
export function clearClip(ex: Doc, pairId: string, wordId: string): Doc {
  return mapWord(ex, pairId, wordId, (w) => ({
    ...w,
    clip: { ...emptyClip(), provenance: w.clip.provenance, voice: w.clip.voice, dialect: w.clip.dialect },
  }));
}

/** «Use «X» for both» — relabel every recorded word of the pair (`voiceAll`). */
export function relabelVoice(ex: Doc, pairId: string, voice: string, provenance: Provenance): Doc {
  return mapPair(ex, pairId, (p) => ({
    ...p,
    words: p.words.map((w) => (w.clip.assetId.trim() === '' ? w : { ...w, clip: { ...w.clip, voice, provenance } })),
  }));
}

/** One dialect for the whole pair — it is one recording session. */
export function setDialect(ex: Doc, pairId: string, dialect: string): Doc {
  return mapPair(ex, pairId, (p) => ({ ...p, words: p.words.map((w) => ({ ...w, clip: { ...w.clip, dialect } })) }));
}

export function setSet(ex: Doc, patch: Partial<ProbeSet>): Doc {
  return { ...ex, set: { ...ex.set, ...patch } };
}

/** The number field of step 3: 2–30, anything unreadable reads as the minimum. */
export function setProbes(ex: Doc, probes: number): Doc {
  const n = Number.isFinite(probes) ? Math.round(probes) : PROBES_INPUT_MIN;
  return setSet(ex, { probes: Math.max(PROBES_INPUT_MIN, Math.min(PROBES_INPUT_MAX, n)) });
}

export function setFeedback(ex: Doc, patch: Partial<Feedback>): Doc {
  return { ...ex, feedback: { ...ex.feedback, ...patch } };
}

export function setScoring(ex: Doc, patch: Partial<Scoring>): Doc {
  return { ...ex, scoring: { ...ex.scoring, ...patch } };
}

export function setPassPct(ex: Doc, passPct: number): Doc {
  const n = Number.isFinite(passPct) ? Math.round(passPct) : 0;
  return setScoring(ex, { passPct: Math.max(0, Math.min(100, n)) });
}
