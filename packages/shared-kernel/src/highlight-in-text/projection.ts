// What a student is allowed to see before answering — SPEC_api_contract §2.
//
// The passage once, its paragraph ranges, and per ready question its id, prompt, unit and —
// only under `showCount` — how many marks are expected. No spans, no `why`, no hints, no
// threshold, no penalty, no orphans — ever (AC-S11). "A client that can compute the score can
// leak it": the verdict, the pass and the penalty all come from the server's check.
//
// Question ids are the authored ids, not per-attempt opaque refs (plan 67 §5, deviation 2):
// the key lives in the other column, an id is random and encodes nothing.

import { splitParagraphsWithOffsets } from '../text/paragraphs.js';
import type { Attempts, Unit } from './model.js';
import { readContent, spanCounts } from './persistence.js';

export interface ProjectedQuestion {
  id: string;
  prompt: string;
  unit: Unit;
  /** Marks expected — `null` unless `settings.showCount` (AC-S10). */
  count: number | null;
}

/**
 * The settings that change what the runner may draw or offer. `revealKey` is shipped
 * although it decides how much of the key the server sends: the runner must know before the
 * first check whether «Vis fasit» exists, and knowing that a key *can* be shown is not the
 * key.
 */
export interface ProjectedSettings {
  attempts: Attempts;
  hints: boolean;
  revealKey: boolean;
}

export interface StudentProjection {
  instruction: string;
  text: string;
  /** `[start, end)` character ranges of each paragraph in `text`. */
  paragraphs: Array<[number, number]>;
  questions: ProjectedQuestion[];
  settings: ProjectedSettings;
}

/**
 * Project the document for one student.
 *
 * Takes both columns because only the key side can say whether a question is ready — its
 * spans live in `expected_answers`. It asks that column one question per question, "how
 * many spans", and carries nothing else from it; a caller passing `{}` gets no questions
 * rather than a leak.
 */
export function toStudentProjection(content: unknown, expectedAnswers: unknown): StudentProjection {
  const persisted = readContent(content);
  const counts = spanCounts(expectedAnswers);
  const s = persisted.settings;

  const questions = persisted.questions
    .filter((q) => q.prompt.trim() !== '' && (counts[q.id] ?? 0) > 0)
    .map((q) => ({
      id: q.id,
      prompt: q.prompt.trim(),
      unit: q.unit,
      count: s.showCount ? (counts[q.id] ?? 0) : null,
    }));

  return {
    instruction: persisted.instruction,
    text: persisted.text,
    paragraphs: splitParagraphsWithOffsets(persisted.text).map((p): [number, number] => [p.bodyStart, p.bodyEnd]),
    questions,
    settings: { attempts: s.attempts, hints: s.hints, revealKey: s.revealKey },
  };
}

/**
 * The settings a graded attempt runs under (plan 67, Q8-A) — one check per question, no hint,
 * no reveal — written over a projection that may already have been made, by content-service,
 * before anyone knew the mode. The runner draws «Prøv på nytt» and «Vis fasit» from these, so
 * they must say what the server will allow. Anything that is not a projection comes back as
 * it was.
 */
export function withGradedSettings(projection: unknown): unknown {
  if (typeof projection !== 'object' || projection === null || Array.isArray(projection)) return projection;
  const graded: ProjectedSettings = { attempts: 1, hints: false, revealKey: false };
  return { ...(projection as Record<string, unknown>), settings: graded };
}
