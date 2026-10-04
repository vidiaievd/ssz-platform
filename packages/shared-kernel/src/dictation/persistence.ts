// How a `dictation` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns:
//
//   content          → title, instruction, mode, language, the audio block, per segment its
//                       id and timecode, the marking rules and the settings
//   expected_answers → per segment: the sentence, its reason, its focus words; the orphans
//
// SPEC_data_model §1: the sentences, the reasons and the transcript never sit in the column
// the student projection is built from. The transcript is not stored at all — it is the
// sentences joined, derived when it is owed (plan 68 §3.1); the audio block's own transcript
// fields are forced empty so no copy of the key can drift into `content`. The audio block is
// forced on: «audio is on and cannot be turned off» (README).
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown` and must not
// throw. It coerces and fills defaults, leaving issues.ts to report what is missing.

import type { ExerciseAudio, ItemAudio } from '../audio/model.js';
import { audioOf } from '../audio/model.js';
import type {
  Attempts,
  DictationContent,
  FocusOrphan,
  FocusWord,
  Marking,
  Mode,
  Near,
  Settings,
} from './model.js';
import {
  ATTEMPTS,
  DEFAULT_AUDIO,
  DEFAULT_MARKING,
  DEFAULT_SETTINGS,
  MODES,
  NEARS,
} from './model.js';

export const TEMPLATE_CODE = 'dictation';

/** One segment as the `content` column holds it — never its sentence. */
export interface PersistedSegment {
  id: string;
  /** The layer's per-item timecode; absent when the segment has none. */
  audio?: ItemAudio;
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  mode: Mode;
  language: string;
  audio: ExerciseAudio;
  segments: PersistedSegment[];
  marking: Marking;
  settings: Settings;
}

/** One segment's key. */
export interface PersistedKey {
  text: string;
  why: string;
  focus: FocusWord[];
}

/** The `expected_answers` column. Keyed by segment id, so reordering cannot shuffle it. */
export interface PersistedAnswers {
  segments: Record<string, PersistedKey>;
  orphans: FocusOrphan[];
}

function studentSafeAudio(audio: ExerciseAudio): ExerciseAudio {
  return {
    ...audio,
    enabled: true,
    transcript: '',
    translation: '',
    settings: { ...audio.settings },
  };
}

export function toContent(ex: DictationContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    mode: ex.mode,
    language: ex.language,
    audio: studentSafeAudio(ex.audio),
    // Unfinished segments are persisted as written — the teacher must be able to leave and
    // come back. The projection drops them.
    segments: ex.segments.map((s) =>
      s.audio === null ? { id: s.id } : { id: s.id, audio: { ...s.audio } },
    ),
    marking: { ...ex.marking },
    settings: { ...ex.settings },
  };
}

export function toExpectedAnswers(ex: DictationContent): PersistedAnswers {
  const segments: PersistedAnswers['segments'] = {};
  for (const s of ex.segments) {
    segments[s.id] = { text: s.text, why: s.why, focus: s.focus.map((f) => ({ ...f })) };
  }
  return { segments, orphans: ex.orphans.map((o) => ({ ...o })) };
}

export function fromPersisted(content: unknown, expectedAnswers: unknown): DictationContent {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);
  const ids = new Set(persisted.segments.map((s) => s.id));

  return {
    title: persisted.title,
    instruction: persisted.instruction,
    mode: persisted.mode,
    language: persisted.language,
    audio: persisted.audio,
    segments: persisted.segments.map((s) => {
      const key = answers.segments[s.id];
      return {
        id: s.id,
        text: key?.text ?? '',
        audio: s.audio ?? null,
        why: key?.why ?? '',
        focus: key?.focus ?? [],
      };
    }),
    // An orphan whose sentence is gone points at nothing; dropped on read.
    orphans: answers.orphans.filter((o) => ids.has(o.segmentId)),
    marking: persisted.marking,
    settings: persisted.settings,
  };
}

/** Read the `content` column on its own — all the runner ever gets to see. */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  const mode = record['mode'];
  return {
    title: asString(record['title']),
    instruction: asString(record['instruction']),
    mode: (MODES as readonly unknown[]).includes(mode) ? (mode as Mode) : 'segments',
    language: asString(record['language']),
    audio: readAudio(content),
    segments: readSegments(record['segments']),
    marking: readMarking(record['marking']),
    settings: readSettings(record['settings']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const record = asRecord(expectedAnswers);
  const segments: PersistedAnswers['segments'] = {};
  for (const [id, raw] of Object.entries(asRecord(record['segments']))) {
    const key = asRecord(raw);
    segments[id] = {
      text: asString(key['text']),
      why: asString(key['why']),
      focus: readFocus(key['focus']),
    };
  }
  return { segments, orphans: readOrphans(record['orphans']) };
}

// ── Coercion ────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** A document that never had an audio block reads as this type's defaults, switched on. */
function readAudio(content: unknown): ExerciseAudio {
  if (asRecord(content)['audio'] === undefined) {
    return { ...DEFAULT_AUDIO, settings: { ...DEFAULT_AUDIO.settings } };
  }
  return studentSafeAudio(audioOf(content));
}

function readItemAudio(value: unknown): ItemAudio | undefined {
  const r = asRecord(value);
  const start = r['start'];
  const end = r['end'];
  return typeof start === 'number' &&
    Number.isFinite(start) &&
    typeof end === 'number' &&
    Number.isFinite(end)
    ? { start, end }
    : undefined;
}

function readSegments(value: unknown): PersistedSegment[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    const audio = readItemAudio(record['audio']);
    return audio === undefined
      ? { id: asString(record['id']) }
      : { id: asString(record['id']), audio };
  });
}

function readFocus(value: unknown): FocusWord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const record = asRecord(raw);
    const wordIndex = record['wordIndex'];
    if (typeof wordIndex !== 'number' || !Number.isInteger(wordIndex) || wordIndex < 0) return [];
    return [{ id: asString(record['id']), wordIndex, why: asString(record['why']) }];
  });
}

function readOrphans(value: unknown): FocusOrphan[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return {
      id: asString(record['id']),
      segmentId: asString(record['segmentId']),
      surface: asString(record['surface']),
      why: asString(record['why']),
    };
  });
}

function readMarking(value: unknown): Marking {
  const record = asRecord(value);
  const near = record['near'];
  const extraCost = record['extraCost'];
  return {
    caseSensitive: asBoolean(record['caseSensitive'], DEFAULT_MARKING.caseSensitive),
    punctuation: asBoolean(record['punctuation'], DEFAULT_MARKING.punctuation),
    near: (NEARS as readonly unknown[]).includes(near) ? (near as Near) : DEFAULT_MARKING.near,
    extraCost:
      typeof extraCost === 'number' && Number.isFinite(extraCost)
        ? Math.min(2, Math.max(0, Math.round(extraCost)))
        : DEFAULT_MARKING.extraCost,
  };
}

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const attempts = record['attempts'];
  const threshold = record['threshold'];
  return {
    attempts: (ATTEMPTS as readonly unknown[]).includes(attempts)
      ? (attempts as Attempts)
      : DEFAULT_SETTINGS.attempts,
    // Clamped rather than defaulted: a threshold outside 0-100 is a bad number, not a missing one.
    threshold:
      typeof threshold === 'number' && Number.isFinite(threshold)
        ? Math.min(100, Math.max(0, Math.round(threshold)))
        : DEFAULT_SETTINGS.threshold,
    showWordCount: asBoolean(record['showWordCount'], DEFAULT_SETTINGS.showWordCount),
    revealKey: asBoolean(record['revealKey'], DEFAULT_SETTINGS.revealKey),
    hints: asBoolean(record['hints'], DEFAULT_SETTINGS.hints),
  };
}
