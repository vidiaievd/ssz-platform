// Model for the `minimal_pairs` exercise — listening discrimination (plan 72).
//
// Source of truth: docs/design/activity-specs/06_design_handoff_minimal_pairs/ in ssz-platform-web
// (README → DECISIONS), as amended by docs/plan/72-minimal-pairs.md.
//
// Three rules hold the whole type together:
//
//   1. **The pair is what is authored; the probe is what is met.** A pair is two or three words
//      that differ by one contrast. A probe is one word of one pair, played once, with the words
//      of its pair (or of the whole set) as buttons. Probes are drawn per attempt, so nothing in
//      the document is in the order the student hears it.
//   2. **One clip per word** (DECISIONS §1). Not one file with timecodes: the draw would tie the
//      exercise to one order, and every probe would be a seek into a longer file. The clip is a
//      media-service asset, held here by id — a signed URL lives an hour, a document lives years
//      (plan 56 §3.1). Its length is the server's, copied in when the asset is ready, because the
//      length check has to run where there is no media service (the publish preflight).
//   3. **The contrast decides the policy.** Whether synthetic speech is allowed, whether a clip
//      needs a dialect, and which atom the answers rate belong to the contrast family, not to the
//      exercise — families live in the language pack (`packs/`), never in code.

/** A short stable id for a pair or a word — the prototype's `MP_ID`. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Who said it. Policy-bearing: it decides what synthetic speech is allowed to do (DECISIONS §2). */
export type Provenance = 'studio' | 'teacher' | 'tts';

export const PROVENANCES: readonly Provenance[] = ['studio', 'teacher', 'tts'];

export interface Clip {
  /** A media-service `exercise_asset`. Empty until something is attached. */
  assetId: string;
  /** Kept for the builder row; never what the student is played. */
  fileName: string;
  /** Milliseconds, from the asset once it is ready. `0` while unknown. */
  durationMs: number;
  provenance: Provenance;
  /**
   * Who is speaking. Two voices in one pair is a blocker (DECISIONS §1), compared as
   * `voice || provenance` — so the uploads of one unnamed session count as one voice.
   */
  voice: string;
  /** Required by a family that `needsDialect` (tonemes); a value from the pack's dialect list. */
  dialect: string;
}

export interface Word {
  id: string;
  text: string;
  /** The meaning shown in the feedback. */
  gloss: string;
  ipa: string;
  clip: Clip;
}

export interface Pair {
  id: string;
  /** `''` — the exercise's contrast. Set only when this pair trains a different one. */
  contrastId: string;
  /** Why this pair is in the set. For the teacher; never shown to the student. Key side. */
  note: string;
  words: Word[];
}

export type Sampling = 'balanced' | 'random' | 'weakest';
export const SAMPLINGS: readonly Sampling[] = ['balanced', 'random', 'weakest'];

/** `pair` — the words of the probe's pair; `all` — every word in the set. */
export type OptionsMode = 'pair' | 'all';
export const OPTIONS_MODES: readonly OptionsMode[] = ['pair', 'all'];

/** Listens allowed per probe. `0` is unlimited (DECISIONS §3). */
export type PlaysPerProbe = 0 | 1 | 2 | 3;
export const PLAYS_PER_PROBE: readonly PlaysPerProbe[] = [1, 2, 3, 0];

export interface ProbeSet {
  probes: number;
  sampling: Sampling;
  /** A word may come up more than once in one sitting. */
  allowRepeat: boolean;
  /** Never more than this many identical answers (same side of the pair) in a row. */
  maxSameAnswer: number;
  options: OptionsMode;
  shuffleOptions: boolean;
  playsPerProbe: PlaysPerProbe;
  /** The clip plays by itself when the probe opens — and spends the first listen. */
  autoplay: boolean;
}

export type SpellingPolicy = 'always' | 'afterAnswer';
export const SPELLING_POLICIES: readonly SpellingPolicy[] = ['always', 'afterAnswer'];

export type GlossPolicy = 'always' | 'afterAnswer' | 'never';
export const GLOSS_POLICIES: readonly GlossPolicy[] = ['always', 'afterAnswer', 'never'];

export interface Feedback {
  immediate: boolean;
  /** On a wrong answer: what was chosen, then what was said, back to back. */
  abCompare: boolean;
  showSpelling: SpellingPolicy;
  showGloss: GlossPolicy;
  showIpa: boolean;
  /** One free retry on the same probe. The first answer is still what counts. */
  secondChance: boolean;
}

/** What the answers are allowed to move (DECISIONS §4). */
export type MemoryPolicy = 'contrast' | 'contrast+word' | 'none';
export const MEMORY_POLICIES: readonly MemoryPolicy[] = ['contrast', 'contrast+word', 'none'];

/** Sittings allowed. `0` is unlimited. */
export type Sittings = 0 | 1 | 2 | 3;
export const SITTINGS: readonly Sittings[] = [0, 1, 2, 3];

export interface Scoring {
  passPct: number;
  memory: MemoryPolicy;
  /** «Heard, in a minimal pair» on the word — never a rating. */
  logWordExposure: boolean;
  attempts: Sittings;
}

export interface MinimalPairsContent {
  title: string;
  /** The language pack the contrast families come from. */
  language: string;
  contrastId: string;
  instruction: string;
  pairs: Pair[];
  set: ProbeSet;
  feedback: Feedback;
  scoring: Scoring;
}

/** Under this many probes one lucky guess moves the score by more than ten points (DECISIONS §3). */
export const MIN_PROBES = 8;
/** Over this many the ear tires and the last answers measure fatigue. */
export const MAX_PROBES = 15;
/** What the number field accepts. The band above is advice; this is the field. */
export const PROBES_INPUT_MIN = 2;
export const PROBES_INPUT_MAX = 30;
/** The scale the step 3 meter is drawn against. */
export const PROBES_METER_MAX = 20;

export const MIN_WORDS = 2;
export const MAX_WORDS = 3;

/** At word scale duration is an answerable cue (DECISIONS §1). Milliseconds. */
export const CLIP_LIMITS = { maxMs: 2500, warnDeltaMs: 350 } as const;

/** Past this many buttons «all words» is a vocabulary test with audio. */
export const MAX_GOOD_OPTIONS = 6;
/** Fewer ready pairs than this and the student learns the recordings, not the sound. */
export const FEW_PAIRS = 3;
/** Above this a mis-click fails the set. */
export const PASS_PCT_HIGH = 90;

export const DEFAULT_SET: ProbeSet = {
  probes: 12,
  sampling: 'balanced',
  allowRepeat: true,
  maxSameAnswer: 2,
  options: 'pair',
  shuffleOptions: true,
  playsPerProbe: 2,
  autoplay: true,
};

export const DEFAULT_FEEDBACK: Feedback = {
  immediate: true,
  abCompare: true,
  showSpelling: 'always',
  showGloss: 'afterAnswer',
  showIpa: false,
  secondChance: false,
};

export const DEFAULT_SCORING: Scoring = {
  passPct: 75,
  memory: 'contrast',
  logWordExposure: true,
  attempts: 0,
};

export function emptyClip(): Clip {
  return { assetId: '', fileName: '', durationMs: 0, provenance: 'studio', voice: '', dialect: '' };
}

export function newWord(text = '', gloss = '', ipa = ''): Word {
  return { id: newId(), text, gloss, ipa, clip: emptyClip() };
}

export function newPair(a = '', b = ''): Pair {
  return { id: newId(), contrastId: '', note: '', words: [newWord(a), newWord(b)] };
}

/** A fresh document: one empty pair, the first family of the language's pack. */
export function emptyContent(language: string, contrastId = ''): MinimalPairsContent {
  return {
    title: '',
    language,
    contrastId,
    instruction: '',
    pairs: [newPair()],
    set: { ...DEFAULT_SET },
    feedback: { ...DEFAULT_FEEDBACK },
    scoring: { ...DEFAULT_SCORING },
  };
}

export function hasClip(clip: Clip | undefined): boolean {
  return clip !== undefined && clip.assetId.trim() !== '';
}

/** «0,78 s», «—» — the prototype's `mpMs`. */
export function formatMs(ms: number): string {
  return ms > 0 ? `${(ms / 1000).toFixed(2).replace('.', ',')} s` : '—';
}

/** `questionId` of the n-th probe, as `/answers` names it. */
export function probeQuestionId(n: number): string {
  return `p${n}`;
}

export function probeNumber(questionId: string): number | null {
  const m = /^p(\d+)$/.exec(questionId);
  return m ? Number(m[1]) : null;
}
