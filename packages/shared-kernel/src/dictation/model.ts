// Model for the `dictation` exercise.
//
// Source of truth: docs/design/activity-specs/03_design_handoff_dictation/ in
// ssz-platform-web, as amended by docs/plan/68-dictation.md.
//
// A recording, the sentences said in it, the rules for what counts as an error and the
// reasons the student is given. Three ideas from the handoff shape everything here:
//
//   1. **A sentence is an element.** One segment = one field = one verdict = one `itemKey`.
//      `mode: 'whole'` is exactly one segment over the whole clip (DECISIONS §1).
//   2. **An error has a name.** The diff classifies every deviation, and a word the author
//      marked as the point of the dictation is reported by name — never as «almost right»
//      (diff.ts, DECISIONS §3, §5).
//   3. **The key never reaches the browser early.** Segment text, reasons and focus words
//      live in `expected_answers` (persistence.ts) and travel only inside a verdict.
//
// The recording is the shared audio block of plan 56, always switched on. A segment's
// timecode is that layer's per-item `audio {start, end}` — the same field every other type's
// items use, so the layer's projection carries it to the student with no code here.
//
// Field names are camelCase (plan 34 §7). Ids are stable and random, never ordinals.

import type { ExerciseAudio, ItemAudio } from '../audio/model.js';
import { AUDIO_DEFAULT } from '../audio/model.js';

/** Past this many sentences one dictation is a lesson (DECISIONS §1). */
export const DC_MAX_SEG = 8;

/** Past this many words a sentence tests memory, not spelling. */
export const DC_SEG_LONG = 18;

/** Under this many words there are no word boundaries to hear. */
export const DC_SEG_SHORT = 3;

/** Seconds. A longer clip is a test, not practice (BEHAVIOR §2). */
export const DC_CLIP_LONG = 180;

/** One playback for more sentences than this is a memory test (prototype `dcIssues`). */
export const DC_ONE_PLAY_CROWDED = 2;

/**
 * The shortest gap between two checks of one segment, in ms — SPEC_api_contract §3 and
 * decision Q4-A of plan 68. Unlimited checks on a free-text field would make the diff a
 * spelling oracle a script could binary-search.
 */
export const DC_CHECK_INTERVAL_MS = 2000;

/** `segments` — sentence by sentence (the default). `whole` — one field for the clip. */
export type Mode = 'segments' | 'whole';

export const MODES: readonly Mode[] = ['segments', 'whole'];

/**
 * What a near miss earns — DECISIONS §3.
 *
 *   strict — zero, reported as «feil»;
 *   flag   — zero, reported as a slip of the hand («skrivefeil»);
 *   half   — half a word.
 */
export type Near = 'strict' | 'flag' | 'half';

export const NEARS: readonly Near[] = ['strict', 'flag', 'half'];

/** What counts as an error — step 3. Normalisation is a scoring rule, not a client detail. */
export interface Marking {
  caseSensitive: boolean;
  punctuation: boolean;
  near: Near;
  /** Words lost per extra word written (DECISIONS §4). No control in the builder; stored. */
  extraCost: number;
}

export const DEFAULT_MARKING: Marking = {
  caseSensitive: false,
  punctuation: false,
  near: 'flag',
  extraCost: 1,
};

/** A word the dictation is about. Reported by name, never «almost right». */
export interface FocusWord {
  id: string;
  /** Index into the segment's own token list (tokens.ts). Moves with an edit — reanchor.ts. */
  wordIndex: number;
  /** Why it is spelled that way. A warning when empty. */
  why: string;
}

export interface Segment {
  /** Stable — the `itemKey` for addressing, review and the verdict. */
  id: string;
  /** Exactly what is said, written as it should be written. Never sent before a verdict. */
  text: string;
  /** The slice of the clip this sentence is. `null` — no timecode. */
  audio: ItemAudio | null;
  /** What to say when the sentence comes back wrong. A blocker when empty. */
  why: string;
  focus: FocusWord[];
}

/** A focus word whose surface vanished from its sentence in an edit (SPEC_data_model §5). */
export interface FocusOrphan {
  /** The focus word's own id — putting it back restores the same word. */
  id: string;
  segmentId: string;
  /** The word as it was written. */
  surface: string;
  why: string;
}

/** Checks per sentence. `0` means unlimited. */
export type Attempts = 0 | 1 | 2 | 3;

export const ATTEMPTS: readonly Attempts[] = [0, 1, 2, 3];

/** Delivery settings — step 4. None of them touches the key. */
export interface Settings {
  attempts: Attempts;
  /** Pass mark per sentence, percent of its words, compared with `>=`. */
  threshold: number;
  /** A counter above the field. Lowers the evidence ceiling (DECISIONS §6). */
  showWordCount: boolean;
  /** «Vis fasit». */
  revealKey: boolean;
  /** `segment.why` under a failed check. */
  hints: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  attempts: 2,
  threshold: 80,
  showWordCount: false,
  revealKey: true,
  hints: true,
};

/**
 * The listening defaults of DECISIONS §7: three playbacks, scrubbing, speed control, the
 * transcript after the check, no listen-first gate — and, unlike every other type, switched
 * on. A dictation without a recording is a copying exercise.
 */
export const DEFAULT_AUDIO: ExerciseAudio = {
  ...AUDIO_DEFAULT,
  enabled: true,
  useSegments: true,
  settings: {
    layout: 'top',
    plays: 3,
    seek: true,
    speed: true,
    gate: 'none',
    transcriptWhen: 'after',
  },
};

/** The whole document, as the builder edits it. */
export interface DictationContent {
  title: string;
  /** The standing instruction above the field. Target language. */
  instruction: string;
  mode: Mode;
  /**
   * The course language the document was created in — the language pack that classifies
   * its errors (decision Q2-A of plan 68). Stamped by the scaffold, not edited in the
   * builder. Empty: no pack, nothing folds.
   */
  language: string;
  audio: ExerciseAudio;
  segments: Segment[];
  /** Focus words waiting for the author after a sentence was edited. */
  orphans: FocusOrphan[];
  marking: Marking;
  settings: Settings;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newSegment(): Segment {
  return { id: newId(), text: '', audio: null, why: '', focus: [] };
}

/**
 * A blank document with one empty segment.
 *
 * The prototype seeds a Norwegian instruction into every course; the instruction comes from
 * the course language's pack instead (presets.ts), empty where there is none.
 */
export function emptyContent(language = '', instruction = ''): DictationContent {
  return {
    title: '',
    instruction,
    mode: 'segments',
    language,
    audio: { ...DEFAULT_AUDIO, settings: { ...DEFAULT_AUDIO.settings } },
    segments: [newSegment()],
    orphans: [],
    marking: { ...DEFAULT_MARKING },
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** How many checks each sentence allows, or `null` for unlimited. */
export function maxChecks(settings: Settings): number | null {
  return settings.attempts === 0 ? null : settings.attempts;
}

/** The pass mark in words rather than percent — what step 4 tells the author. */
export function passMark(settings: Settings, words: number): number {
  if (words <= 0) return 0;
  return Math.ceil((settings.threshold / 100) * words);
}
