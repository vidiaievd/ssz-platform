// What a student is allowed to see before writing — SPEC_api_contract §2, AC-R3, AC-X2.
//
// The instruction, the shape, per ready segment its id — and its word count only under
// `showWordCount`, because a length is part of the answer. No sentence, no reason, no focus
// word, no orphan, no transcript, no marking rules, no language, no pass mark — ever. The
// verdict, the pass and the score come from the server's check (plan 68 §5, deviation 15).
//
// The audio block is not added here: content-service and the engine put it on with the audio
// layer's `withStudentAudio`, which also gathers the segments' timecodes onto
// `audio.segments` — the same path every audio-capable type takes.
//
// Segment ids are the authored ids (plan 68 §5, deviation 2): the key lives in the other
// column, and an id is random and encodes nothing.

import type { Attempts, Mode } from './model.js';
import { readAnswers, readContent } from './persistence.js';
import { wordCount } from './tokens.js';

export interface ProjectedSegment {
  id: string;
  /** Present only under `settings.showWordCount`. */
  wordCount?: number;
}

/** The settings that change what the runner may draw or offer. */
export interface ProjectedSettings {
  attempts: Attempts;
  hints: boolean;
  revealKey: boolean;
  showWordCount: boolean;
}

export interface StudentProjection {
  instruction: string;
  mode: Mode;
  segments: ProjectedSegment[];
  settings: ProjectedSettings;
}

/**
 * Project the document for one student.
 *
 * Takes both columns because only the key side can say whether a segment is ready. It asks
 * that column, per segment, "is anything written" and — under `showWordCount` — "how many
 * words"; a caller passing `{}` gets no segments rather than a leak.
 */
export function toStudentProjection(content: unknown, expectedAnswers: unknown): StudentProjection {
  const persisted = readContent(content);
  const keys = readAnswers(expectedAnswers).segments;
  const s = persisted.settings;

  const segments = persisted.segments.flatMap((seg): ProjectedSegment[] => {
    const text = keys[seg.id]?.text ?? '';
    if (text.trim() === '') return [];
    return [s.showWordCount ? { id: seg.id, wordCount: wordCount(text) } : { id: seg.id }];
  });

  return {
    instruction: persisted.instruction,
    mode: persisted.mode,
    segments,
    settings: {
      attempts: s.attempts,
      hints: s.hints,
      revealKey: s.revealKey,
      showWordCount: s.showWordCount,
    },
  };
}

/**
 * The settings a graded attempt runs under (plan 67, Q8-A) — one check per segment, no
 * hint, no reveal — written over a projection that may already have been made. Anything that
 * is not a projection comes back as it was.
 */
export function withGradedSettings(projection: unknown): unknown {
  if (typeof projection !== 'object' || projection === null || Array.isArray(projection))
    return projection;
  const record = projection as Record<string, unknown>;
  const current = (
    typeof record['settings'] === 'object' && record['settings'] !== null ? record['settings'] : {}
  ) as Record<string, unknown>;
  const graded: ProjectedSettings = {
    attempts: 1,
    hints: false,
    revealKey: false,
    showWordCount: current['showWordCount'] === true,
  };
  return { ...record, settings: graded };
}
