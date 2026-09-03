// The audio layer — plan 56 §4, from the design handoff
// `design_handoff_audio_exercises/README.md` ("Data model").
//
// This is not a thirteenth exercise type. It is a block any document may carry, and one
// switch inside it turns the exercise it belongs to into a listening exercise: the
// teacher attaches a clip and the rules for hearing it, the student answers the same
// items with a player above them.
//
// Two decisions of plan 56 shape everything here, and both are departures from the
// prototype:
//
//   1. **The source is an asset id, not a URL** (§3.1). A pre-signed URL lives an hour;
//      a document lives years. The platform already made this choice twice — the
//      `[audio:id]` token in a lesson body and the media slot on a `translate` sentence
//      — and a third spelling of it would be a third thing to keep in step.
//   2. **A missing block reads as "off"** (§3.4). Every document written before this
//      plan has no `audio` field, and every one of them must load and play exactly as it
//      did. So nothing reads `ex.audio.x`; everything goes through `audioOf`.
//
// Field names are camelCase (plan 34 §7).

/**
 * Where the clip comes from.
 *
 * `asset` covers the ordinary case — a file the teacher uploaded, held by media-service
 * under `exercise_asset` and readable by any authenticated learner once it is ready.
 * `link` is an external URL. `lesson` borrows the narration of a Read & Listen lesson
 * **by reference**, so replacing it in the lesson replaces it here; it ships last
 * (plan 56 §3.8) because it is the one mode that has to read another aggregate.
 */
export type AudioSource = 'asset' | 'link' | 'lesson';

/** Where the player sits relative to the items. */
export type AudioLayout = 'top' | 'gate';

/** How many times the clip may be started from the top. `0` is unlimited. */
export type PlayLimit = 0 | 1 | 2 | 3;

/** Whether the items wait for one complete listen. */
export type GateMode = 'none' | 'first';

/** When the student may read what the clip says. */
export type TranscriptPolicy = 'never' | 'after' | 'always';

/** The clip a `source: 'lesson'` block borrows. Resolved at read time, never copied. */
export interface LessonAudioRef {
  lessonId: string;
  /** Which variant of the lesson holds the narration. */
  variant: string;
}

export interface AudioSettings {
  layout: AudioLayout;
  plays: PlayLimit;
  /** Scrubbing and −10 s. Off makes the play limit an actual limit (BEHAVIOR §7). */
  seek: boolean;
  /** Offer 0.75 / 1 / 1.25. */
  speed: boolean;
  gate: GateMode;
  transcriptWhen: TranscriptPolicy;
}

export interface ExerciseAudio {
  /** The master switch. `false` means the exercise is unchanged in every respect. */
  enabled: boolean;
  source: AudioSource;
  /** `source: 'asset'` — a media-service asset uploaded as `exercise_asset`. */
  assetId: string;
  /** `source: 'link'` — an external URL. Never a pre-signed one (§3.1). */
  url: string;
  /** `source: 'lesson'` — the narration this clip borrows. */
  lessonRef: LessonAudioRef | null;
  /** Kept for the file row in the builder; not what the student is played. */
  fileName: string;
  /** What the student sees: "Dialog: på legekontoret". */
  title: string;
  /**
   * Seconds. A hint from the client, editable by the author (§3.7).
   *
   * media-service runs ffprobe already but stores nothing, so there is no server-side
   * probe to trust. That is exactly why a timecode past the end of the clip is a
   * warning rather than a blocker: the number it is checked against is not authoritative.
   */
  duration: number;
  /**
   * What the clip says.
   *
   * For a listening exercise this **is the answer**, which is why it is dosed by the
   * same channel as the key rather than shipped with the projection (§3.3). Nothing in
   * this module decides that; `issues.ts` only insists it exists when the policy needs it.
   */
  transcript: string;
  /** Optional, shown under the transcript. */
  translation: string;
  /** Enables per-item timecodes. */
  useSegments: boolean;
  settings: AudioSettings;
}

/** A slice of the clip belonging to one item. Absent means the whole clip. */
export interface ItemAudio {
  start: number;
  end: number;
}

/**
 * The canonical default, and the value a document without the field reads as.
 *
 * `layout: 'top'`, `gate: 'none'`, `plays: 0`, `seek: true` — every default is the least
 * restrictive one, so switching audio on changes what the student *has* and not what
 * they are *denied*. Every restriction in this model is something a teacher chose.
 */
export const AUDIO_DEFAULT: ExerciseAudio = {
  enabled: false,
  source: 'asset',
  assetId: '',
  url: '',
  lessonRef: null,
  fileName: '',
  title: '',
  duration: 0,
  transcript: '',
  translation: '',
  useSegments: false,
  settings: {
    layout: 'top',
    plays: 0,
    seek: true,
    speed: true,
    gate: 'none',
    transcriptWhen: 'never',
  },
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const SOURCES: readonly AudioSource[] = ['asset', 'link', 'lesson'];
const LAYOUTS: readonly AudioLayout[] = ['top', 'gate'];
const GATES: readonly GateMode[] = ['none', 'first'];
const POLICIES: readonly TranscriptPolicy[] = ['never', 'after', 'always'];
const LIMITS: readonly PlayLimit[] = [0, 1, 2, 3];

function playLimit(value: unknown): PlayLimit {
  return typeof value === 'number' && (LIMITS as readonly number[]).includes(value)
    ? (value as PlayLimit)
    : AUDIO_DEFAULT.settings.plays;
}

/**
 * Read the audio block off any document, whatever shape it is in.
 *
 * The only way anything in this codebase is allowed to reach the block. A document from
 * before this plan has no field at all; a document half-written by an older client may
 * have some of it. Both read as a whole `ExerciseAudio`, and an unreadable value reads as
 * its default rather than throwing — a malformed setting must not make an exercise
 * unopenable.
 */
export function audioOf(content: unknown): ExerciseAudio {
  const doc = record(content);
  const raw = doc === null ? null : record(doc['audio']);
  if (raw === null) return { ...AUDIO_DEFAULT, settings: { ...AUDIO_DEFAULT.settings } };

  const settings = record(raw['settings']) ?? {};
  const ref = record(raw['lessonRef']);
  const d = AUDIO_DEFAULT;

  return {
    enabled: bool(raw['enabled'], d.enabled),
    source: oneOf(raw['source'], SOURCES, d.source),
    assetId: str(raw['assetId'], d.assetId),
    url: str(raw['url'], d.url),
    lessonRef:
      ref === null
        ? null
        : { lessonId: str(ref['lessonId'], ''), variant: str(ref['variant'], '') },
    fileName: str(raw['fileName'], d.fileName),
    title: str(raw['title'], d.title),
    duration: Math.max(0, num(raw['duration'], d.duration)),
    transcript: str(raw['transcript'], d.transcript),
    translation: str(raw['translation'], d.translation),
    useSegments: bool(raw['useSegments'], d.useSegments),
    settings: {
      layout: oneOf(settings['layout'], LAYOUTS, d.settings.layout),
      plays: playLimit(settings['plays']),
      seek: bool(settings['seek'], d.settings.seek),
      speed: bool(settings['speed'], d.settings.speed),
      gate: oneOf(settings['gate'], GATES, d.settings.gate),
      transcriptWhen: oneOf(settings['transcriptWhen'], POLICIES, d.settings.transcriptWhen),
    },
  };
}

/** Is this document a listening exercise? The one question most callers have. */
export function audioOn(content: unknown): boolean {
  return audioOf(content).enabled;
}

/**
 * Whether a clip is actually attached, by the rules of the active source.
 *
 * Only the active `source` counts. Switching from a file to a link keeps the file name in
 * the document — the author may switch back — but a link-sourced exercise with an empty
 * URL has nothing to play, whatever else is still lying in the block (BEHAVIOR §2).
 */
export function hasClip(audio: ExerciseAudio): boolean {
  if (audio.source === 'asset') return audio.assetId.trim() !== '';
  if (audio.source === 'link') return audio.url.trim() !== '';
  return audio.lessonRef !== null && audio.lessonRef.lessonId.trim() !== '';
}

/** The timecode of one item, if it has one and the exercise uses timecodes. */
export function segmentOf(audio: ExerciseAudio, item: unknown): ItemAudio | null {
  if (!audio.useSegments) return null;
  const seg = record(record(item)?.['audio']);
  if (seg === null) return null;
  const start = num(seg['start'], NaN);
  const end = num(seg['end'], NaN);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { start, end };
}

/**
 * `mm:ss` → seconds. `1:36` is 96; `96` is 96; anything else is `null`.
 *
 * `null` rather than `0` on purpose: the duration field keeps its last valid value while
 * the author is mid-keystroke, and a parse that answered `0` would blank the field on the
 * way to typing `1:36` (BEHAVIOR §2).
 */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const colon = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (colon) {
    return Number(colon[1]) * 60 + Number(colon[2]);
  }
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** Seconds → `m:ss`. The one time format the player, the chip and the field all use. */
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}
