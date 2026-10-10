// The validation engine for `minimal_pairs` — `mpIssues` and `mpStepState` of the handoff.
//
// One list drives the rail dots, the notes in each step, the gate and the server's publish
// preflight. `blocker` is reserved for what makes the set unplayable or harmful (spec 19 §1.2,
// DECISIONS §1–2): nothing to play, a probe with two right answers, a word that would play
// silence, a pair that can be told apart by the speaker's voice, and synthetic speech on a
// contrast synthesis destroys.
//
// Issues carry a code and the parameters a message needs, never the message — the teacher UI is
// translated four ways. Issues about a pair or a word name it by id; the builder turns the id
// into «Pair 2» and «kjære».
//
// The synthesis policy is read per pair, from the pair's own family (plan 72 §4.2 p. 2):
// DECISIONS §2 says «per contrast, not per exercise», and a set may mix families.

import {
  contrastsInSet,
  filledWords,
  pairSpread,
  probePool,
  readyPairs,
  syntheticByContrast,
  voicesOf,
} from './derive.js';
import type { MinimalPairsContent } from './model.js';
import {
  CLIP_LIMITS,
  FEW_PAIRS,
  hasClip,
  MAX_GOOD_OPTIONS,
  MAX_PROBES,
  MAX_WORDS,
  MIN_PROBES,
  MIN_WORDS,
  PASS_PCT_HIGH,
} from './model.js';
import { contrastsOf, exerciseContrast, pairContrast } from './packs/index.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's jump links both use it. */
export type IssueStep = 1 | 2 | 3 | 4 | 5;

export type Issue =
  // ── Step 1 — contrast and pairs ──
  | { code: 'MP_NO_CONTRAST'; level: 'blocker'; step: 1; language: string }
  | { code: 'MP_NO_PAIRS'; level: 'blocker'; step: 1 }
  | { code: 'MP_PAIR_UNDER_TWO'; level: 'blocker'; step: 1; pairId: string }
  | { code: 'MP_PAIR_DUPLICATE'; level: 'blocker'; step: 1; pairId: string }
  | { code: 'MP_GROUP_TOO_LARGE'; level: 'warning'; step: 1; pairId: string; words: number }
  | { code: 'MP_FEW_PAIRS'; level: 'warning'; step: 1; ready: number }
  | { code: 'MP_NO_GLOSS'; level: 'info'; step: 1; pairId: string }
  | { code: 'MP_MIXED_CONTRASTS'; level: 'info'; step: 1; contrastIds: string[] }
  // ── Step 2 — the recordings ──
  | { code: 'MP_WORD_NO_CLIP'; level: 'blocker'; step: 2; pairId: string; wordId: string; text: string }
  | { code: 'MP_PAIR_MIXED_VOICES'; level: 'blocker'; step: 2; pairId: string; voices: string[] }
  | { code: 'MP_TTS_BLOCKED'; level: 'blocker'; step: 2; contrastId: string; count: number }
  | { code: 'MP_CLIP_TOO_LONG'; level: 'warning'; step: 2; pairId: string; wordId: string; text: string; durationMs: number }
  | { code: 'MP_PAIR_LENGTH_SPREAD'; level: 'warning'; step: 2; pairId: string; spreadMs: number }
  | { code: 'MP_TTS_RISKY'; level: 'warning'; step: 2; contrastId: string; count: number }
  | { code: 'MP_DIALECT_MISSING'; level: 'warning'; step: 2 }
  | { code: 'MP_TTS_NOTE'; level: 'info'; step: 2; contrastId: string; count: number }
  // ── Step 3 — the probe set ──
  | { code: 'MP_POOL_TOO_SMALL'; level: 'blocker'; step: 3; probes: number; pool: number }
  | { code: 'MP_FEW_PROBES'; level: 'warning'; step: 3; probes: number; min: number }
  | { code: 'MP_MANY_PROBES'; level: 'warning'; step: 3; probes: number; max: number }
  | { code: 'MP_UNLIMITED_REPLAYS'; level: 'warning'; step: 3 }
  | { code: 'MP_TOO_MANY_OPTIONS'; level: 'warning'; step: 3; options: number }
  // ── Step 4 — feedback ──
  | { code: 'MP_NO_IMMEDIATE'; level: 'warning'; step: 4 }
  | { code: 'MP_NO_AB'; level: 'warning'; step: 4 }
  | { code: 'MP_SPELLING_HIDDEN'; level: 'info'; step: 4 }
  | { code: 'MP_SECOND_CHANCE'; level: 'info'; step: 4 }
  // ── Step 5 — result and memory ──
  | { code: 'MP_WORD_MEMORY'; level: 'warning'; step: 5 }
  | { code: 'MP_PASS_TOO_HIGH'; level: 'warning'; step: 5; passPct: number; probes: number }
  | { code: 'MP_NO_MEMORY'; level: 'info'; step: 5 }
  /**
   * Plan 72 Q1-A. The contrast is recorded as evidence now; its own review schedule needs the
   * learning consumer, which waits for phase 7 of plan 63 — until then the set comes back as one
   * card. Said rather than hidden, as `RA_AI_NOT_LIVE` does for the AI stage of `read_aloud`.
   */
  | { code: 'MP_CONTRAST_CARD_LATER'; level: 'info'; step: 5 }
  /** Plan 72 Q1-A — exposure is kept with the attempt and not yet written to the word. */
  | { code: 'MP_EXPOSURE_LATER'; level: 'info'; step: 5 };

export type IssueCode = Issue['code'];

/** Everything wrong with the document, in the prototype's order. */
export function issues(ex: MinimalPairsContent): Issue[] {
  const out: Issue[] = [];
  const ready = readyPairs(ex).length;
  const pool = probePool(ex);

  if (contrastsOf(ex.language).length === 0 || !exerciseContrast(ex)) {
    out.push({ code: 'MP_NO_CONTRAST', level: 'blocker', step: 1, language: ex.language });
  }
  if (ex.pairs.length === 0) out.push({ code: 'MP_NO_PAIRS', level: 'blocker', step: 1 });

  for (const p of ex.pairs) {
    const words = filledWords(p);
    if (words.length < MIN_WORDS) {
      out.push({ code: 'MP_PAIR_UNDER_TWO', level: 'blocker', step: 1, pairId: p.id });
    }
    const spellings = words.map((w) => w.text.trim().toLowerCase());
    if (spellings.length > 1 && new Set(spellings).size !== spellings.length) {
      out.push({ code: 'MP_PAIR_DUPLICATE', level: 'blocker', step: 1, pairId: p.id });
    }
    for (const w of words) {
      if (!hasClip(w.clip)) {
        out.push({ code: 'MP_WORD_NO_CLIP', level: 'blocker', step: 2, pairId: p.id, wordId: w.id, text: w.text });
      } else if (w.clip.durationMs > CLIP_LIMITS.maxMs) {
        out.push({
          code: 'MP_CLIP_TOO_LONG',
          level: 'warning',
          step: 2,
          pairId: p.id,
          wordId: w.id,
          text: w.text,
          durationMs: w.clip.durationMs,
        });
      }
    }
    const voices = voicesOf(p);
    if (words.length > 1 && voices.length > 1) {
      out.push({ code: 'MP_PAIR_MIXED_VOICES', level: 'blocker', step: 2, pairId: p.id, voices });
    }
    const spread = pairSpread(p);
    if (spread > CLIP_LIMITS.warnDeltaMs) {
      out.push({ code: 'MP_PAIR_LENGTH_SPREAD', level: 'warning', step: 2, pairId: p.id, spreadMs: spread });
    }
    // The UI stops at three; a document written otherwise still says so.
    if (words.length > MAX_WORDS && ex.set.options === 'pair') {
      out.push({ code: 'MP_GROUP_TOO_LARGE', level: 'warning', step: 1, pairId: p.id, words: words.length });
    }
    // Only a pair that says something: an empty new pair already has its blocker.
    if (words.length > 0 && !words.some((w) => w.gloss.trim() !== '') && ex.feedback.showGloss !== 'never') {
      out.push({ code: 'MP_NO_GLOSS', level: 'info', step: 1, pairId: p.id });
    }
  }

  const families = contrastsOf(ex.language);
  for (const [contrastId, count] of syntheticByContrast(ex)) {
    const tts = families.find((c) => c.id === contrastId)?.tts ?? 'ok';
    if (tts === 'no') out.push({ code: 'MP_TTS_BLOCKED', level: 'blocker', step: 2, contrastId, count });
    if (tts === 'risky') out.push({ code: 'MP_TTS_RISKY', level: 'warning', step: 2, contrastId, count });
    if (tts === 'ok') out.push({ code: 'MP_TTS_NOTE', level: 'info', step: 2, contrastId, count });
  }

  const undialected = ex.pairs.some(
    (p) =>
      pairContrast(ex, p)?.needsDialect === true &&
      filledWords(p).some((w) => hasClip(w.clip) && w.clip.dialect.trim() === ''),
  );
  if (undialected) out.push({ code: 'MP_DIALECT_MISSING', level: 'warning', step: 2 });

  const inSet = contrastsInSet(ex);
  if (inSet.length > 1) {
    out.push({ code: 'MP_MIXED_CONTRASTS', level: 'info', step: 1, contrastIds: inSet });
  }

  // ── Step 3 ─────────────────────────────────────────────────────────────────
  const s = ex.set;
  if (s.probes < MIN_PROBES) {
    out.push({ code: 'MP_FEW_PROBES', level: 'warning', step: 3, probes: s.probes, min: MIN_PROBES });
  }
  if (s.probes > MAX_PROBES) {
    out.push({ code: 'MP_MANY_PROBES', level: 'warning', step: 3, probes: s.probes, max: MAX_PROBES });
  }
  if (ready > 0 && !s.allowRepeat && s.probes > pool) {
    out.push({ code: 'MP_POOL_TOO_SMALL', level: 'blocker', step: 3, probes: s.probes, pool });
  }
  if (s.playsPerProbe === 0) out.push({ code: 'MP_UNLIMITED_REPLAYS', level: 'warning', step: 3 });
  if (s.options === 'all' && pool > MAX_GOOD_OPTIONS) {
    out.push({ code: 'MP_TOO_MANY_OPTIONS', level: 'warning', step: 3, options: pool });
  }

  // ── Step 4 ─────────────────────────────────────────────────────────────────
  const f = ex.feedback;
  if (!f.immediate) out.push({ code: 'MP_NO_IMMEDIATE', level: 'warning', step: 4 });
  if (f.immediate && !f.abCompare) out.push({ code: 'MP_NO_AB', level: 'warning', step: 4 });
  if (f.showSpelling === 'afterAnswer' && s.options !== 'all') {
    out.push({ code: 'MP_SPELLING_HIDDEN', level: 'info', step: 4 });
  }
  if (f.secondChance) out.push({ code: 'MP_SECOND_CHANCE', level: 'info', step: 4 });

  // ── Step 5 ─────────────────────────────────────────────────────────────────
  const sc = ex.scoring;
  if (sc.memory === 'contrast+word') out.push({ code: 'MP_WORD_MEMORY', level: 'warning', step: 5 });
  if (sc.memory === 'none') out.push({ code: 'MP_NO_MEMORY', level: 'info', step: 5 });
  if (sc.memory !== 'none') out.push({ code: 'MP_CONTRAST_CARD_LATER', level: 'info', step: 5 });
  if (sc.logWordExposure) out.push({ code: 'MP_EXPOSURE_LATER', level: 'info', step: 5 });
  if (sc.passPct > PASS_PCT_HIGH) {
    out.push({ code: 'MP_PASS_TOO_HIGH', level: 'warning', step: 5, passPct: sc.passPct, probes: s.probes });
  }
  if (ready > 0 && ready < FEW_PAIRS) out.push({ code: 'MP_FEW_PAIRS', level: 'warning', step: 1, ready });

  return out;
}

/** Whether the exercise may be published or assigned — the gate's and the preflight's question. */
export function isReady(ex: MinimalPairsContent): boolean {
  return !issues(ex).some((i) => i.level === 'blocker');
}

export function blockers(ex: MinimalPairsContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'blocker');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/**
 * The rail dot for a step (`mpStepState`): blockers first, then warnings, then `empty` — step 1
 * without a single ready pair, step 2 with a word still missing its clip — then `ok`. Info does
 * not colour the dot.
 */
export function stepState(ex: MinimalPairsContent, step: IssueStep): StepState {
  const own = issues(ex).filter((i) => i.step === step);
  const errs = own.filter((i) => i.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (own.some((i) => i.level === 'warning')) return { s: 'warn', errs: 0 };
  const empty =
    (step === 1 && readyPairs(ex).length === 0) ||
    (step === 2 && ex.pairs.some((p) => filledWords(p).some((w) => !hasClip(w.clip))));
  return { s: empty ? 'empty' : 'ok', errs: 0 };
}
