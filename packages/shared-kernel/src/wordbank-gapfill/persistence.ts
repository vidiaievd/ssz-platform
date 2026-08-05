// How a `word_bank_gap_fill` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns and its own fields:
//
//   content          → sentences, distractors, settings
//   expected_answers → feedback, alternatives
//   the row + its instruction row → id, module, title, instructions, updatedAt
//
// That split is defined once, here, because four steps depend on it — the student
// projection, validation on save, the engine's grading, and the builder's autosave —
// and each of them re-deriving it is four chances to put an answer in the wrong column.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown`, may
// predate the current shape, and must not throw. It coerces and fills defaults instead,
// leaving the validation engine to report what is actually missing.

import type {
  GapFeedback,
  GapFillTask,
  GapKey,
  PairFeedback,
  Sentence,
  Settings,
  WordBankGapFill,
} from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

export const TEMPLATE_CODE = 'word_bank_gap_fill';

/** The `content` column: everything about the task, answers included (they are in the text). */
export type PersistedContent = GapFillTask;

/** The `expected_answers` column: everything the student must not see before checking. */
export interface PersistedAnswers {
  feedback: Record<GapKey, GapFeedback>;
  alternatives?: Record<GapKey, string[]>;
}

/** The parts of the document the exercise row owns rather than its JSON columns. */
export interface DocumentEnvelope {
  id: string;
  moduleId: string;
  title: string;
  instructions: string;
  updatedAt: string;
}

export function toContent(ex: WordBankGapFill): PersistedContent {
  return { sentences: ex.sentences, distractors: ex.distractors, settings: ex.settings };
}

export function toExpectedAnswers(ex: WordBankGapFill): PersistedAnswers {
  return {
    feedback: ex.feedback,
    ...(ex.alternatives === undefined ? {} : { alternatives: ex.alternatives }),
  };
}

export function fromPersisted(
  envelope: DocumentEnvelope,
  content: unknown,
  expectedAnswers: unknown,
): WordBankGapFill {
  const answersRecord = asRecord(expectedAnswers);
  const alternatives = readAlternatives(answersRecord['alternatives']);

  return {
    ...envelope,
    type: TEMPLATE_CODE,
    ...readContent(content),
    feedback: readFeedback(answersRecord['feedback']),
    ...(alternatives === undefined ? {} : { alternatives }),
  };
}

/**
 * Read the `content` column on its own. The student projection needs exactly this and
 * nothing else, and it must not have to invent a title to get at it.
 */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  return {
    sentences: readSentences(record['sentences']),
    distractors: readStringArray(record['distractors']),
    settings: readSettings(record['settings']),
  };
}

// ── Coercion ────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readSentences(value: unknown): Sentence[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    const record = asRecord(raw);
    const hint = record['hint'];
    // Only whole, non-negative indices can address a token; anything else is noise
    // from an older shape and would silently become gap `NaN`.
    const gaps = Array.isArray(record['gaps'])
      ? record['gaps'].filter(
          (index): index is number =>
            typeof index === 'number' && Number.isInteger(index) && index >= 0,
        )
      : [];

    return {
      id: asString(record['id']),
      text: asString(record['text']),
      gaps,
      ...(typeof hint === 'string' ? { hint } : {}),
    };
  });
}

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const input = record['input'];

  return {
    shuffle: asBoolean(record['shuffle'], DEFAULT_SETTINGS.shuffle),
    allowReuse: asBoolean(record['allowReuse'], DEFAULT_SETTINGS.allowReuse),
    showBankCount: asBoolean(record['showBankCount'], DEFAULT_SETTINGS.showBankCount),
    caseSensitive: asBoolean(record['caseSensitive'], DEFAULT_SETTINGS.caseSensitive),
    input: input === 'free' || input === 'bank' ? input : DEFAULT_SETTINGS.input,
  };
}

function readFeedback(value: unknown): Record<GapKey, GapFeedback> {
  const out: Record<GapKey, GapFeedback> = {};

  for (const [key, raw] of Object.entries(asRecord(value))) {
    const record = asRecord(raw);
    out[key] = {
      fallback: asString(record['fallback']),
      why: asString(record['why']),
      pairs: readPairs(record['pairs']),
    };
  }

  return out;
}

function readPairs(value: unknown): Record<string, PairFeedback> {
  const out: Record<string, PairFeedback> = {};

  for (const [word, raw] of Object.entries(asRecord(value))) {
    const record = asRecord(raw);
    // An entry with no recorded origin predates the field, which means a human wrote
    // it: AI drafting did not exist yet. Defaulting to 'ai_draft' would hide teachers'
    // own explanations from their students.
    out[word] = {
      text: asString(record['text']),
      origin: record['origin'] === 'ai_draft' ? 'ai_draft' : 'author',
    };
  }

  return out;
}

function readAlternatives(value: unknown): Record<GapKey, string[]> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;

  const out: Record<GapKey, string[]> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = readStringArray(raw);
  }
  return out;
}
