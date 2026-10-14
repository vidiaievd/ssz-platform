/**
 * How a lesson narration is delivered (plan 74, phase 6): the speed of the words and the
 * length of the pauses between paragraphs and turns. The words' speed depends on the learner's
 * level — a beginner needs them slower — so each CEFR level has its own default, taken from
 * the course the lesson belongs to. An author can still choose another pace for one lesson.
 */
export interface NarrationStyle {
  /** Phoneme length multiplier: above 1 speaks slower. */
  lengthScale: number;
  /** Multiplier on the pauses between segments (the 600 / 900 ms of decision D2). */
  pauseScale: number;
}

export const LENGTH_SCALE_RANGE = { min: 1.0, max: 2.5 } as const;
export const PAUSE_SCALE_RANGE = { min: 0.5, max: 2.0 } as const;

export const NARRATION_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type NarrationLevel = (typeof NARRATION_LEVELS)[number];

/**
 * Measured on Piper's `talesyntese` voice with a steady rhythm (noise-w 0): 1.4 speaks the
 * words at the voice's own pace, each 0.1 above is about 6% slower. B1 at 1.7 was judged right
 * by listening (14.10); the other levels step 0.15 either way.
 */
export const LEVEL_LENGTH_SCALE: Readonly<Record<NarrationLevel, number>> = {
  A1: 2.0,
  A2: 1.85,
  B1: 1.7,
  B2: 1.55,
  C1: 1.4,
  C2: 1.4,
};

export const DEFAULT_PAUSE_SCALE = 1;

export function isNarrationLevel(value: string | null | undefined): value is NarrationLevel {
  return (NARRATION_LEVELS as readonly string[]).includes(value ?? '');
}

/**
 * The default style for a level; `fallbackLengthScale` (the configured pace) answers a level
 * that is missing or not a CEFR one — a course on another level system.
 */
export function defaultNarrationStyle(level: string | null | undefined, fallbackLengthScale: number): NarrationStyle {
  return {
    lengthScale: isNarrationLevel(level) ? LEVEL_LENGTH_SCALE[level] : fallbackLengthScale,
    pauseScale: DEFAULT_PAUSE_SCALE,
  };
}

const clamp = (value: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, value));

/** The author's choice laid over the level's default; out-of-range values are pulled in. */
export function resolveNarrationStyle(
  chosen: { lengthScale?: number | null; pauseScale?: number | null },
  defaults: NarrationStyle,
): NarrationStyle {
  return {
    lengthScale: clamp(chosen.lengthScale ?? defaults.lengthScale, LENGTH_SCALE_RANGE),
    pauseScale: clamp(chosen.pauseScale ?? defaults.pauseScale, PAUSE_SCALE_RANGE),
  };
}
