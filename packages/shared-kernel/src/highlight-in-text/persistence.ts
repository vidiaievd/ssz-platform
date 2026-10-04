// How a `highlight_in_text` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns:
//
//   content          → title, instruction, the passage, settings, and per question its id,
//                       prompt and unit
//   expected_answers → per question: the spans with their reasons, the miss hint, the
//                       false-positive hint; and the orphans
//
// SPEC_data_model §1: "spans, span.why, missHint and fpHint live in expected_answers". The
// orphans go there too (plan 67, phase 1): an orphan's surface is a former answer, and the
// column the student projection is built from has no business holding one. The authored
// model keeps everything on the question for editing convenience; this file is the one
// place that knows where each half is stored.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown` and must not
// throw. It coerces and fills defaults, leaving issues.ts to report what is missing.

import type { Attempts, HighlightInTextContent, Orphan, Penalty, Question, Settings, Span, Unit } from './model.js';
import { ATTEMPTS, DEFAULT_SETTINGS, PENALTIES, UNITS } from './model.js';

export const TEMPLATE_CODE = 'highlight_in_text';

/** One question as the `content` column holds it — never its key. */
export interface PersistedQuestion {
  id: string;
  prompt: string;
  unit: Unit;
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  text: string;
  questions: PersistedQuestion[];
  settings: Settings;
}

/** One question's key. */
export interface PersistedKey {
  spans: Span[];
  missHint: string;
  fpHint: string;
}

/** The `expected_answers` column. Keyed by question id, so reordering cannot shuffle it. */
export interface PersistedAnswers {
  questions: Record<string, PersistedKey>;
  orphans: Orphan[];
}

export function toContent(ex: HighlightInTextContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    text: ex.text,
    // Unfinished questions are persisted as written — the teacher must be able to leave and
    // come back. The projection drops them.
    questions: ex.questions.map((q) => ({ id: q.id, prompt: q.prompt, unit: q.unit })),
    settings: { ...ex.settings },
  };
}

export function toExpectedAnswers(ex: HighlightInTextContent): PersistedAnswers {
  const questions: PersistedAnswers['questions'] = {};
  for (const q of ex.questions) {
    questions[q.id] = {
      spans: q.spans.map((s) => ({ id: s.id, start: s.start, end: s.end, why: s.why })),
      missHint: q.missHint,
      fpHint: q.fpHint,
    };
  }
  return { questions, orphans: ex.orphans.map((o) => ({ ...o })) };
}

export function fromPersisted(content: unknown, expectedAnswers: unknown): HighlightInTextContent {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);
  const ids = new Set(persisted.questions.map((q) => q.id));

  return {
    title: persisted.title,
    instruction: persisted.instruction,
    text: persisted.text,
    questions: persisted.questions.map((q): Question => {
      const key = answers.questions[q.id];
      return {
        id: q.id,
        prompt: q.prompt,
        unit: q.unit,
        spans: key?.spans ?? [],
        missHint: key?.missHint ?? '',
        fpHint: key?.fpHint ?? '',
      };
    }),
    // An orphan whose question is gone points at nothing (AC-A6); it is dropped on read
    // rather than left to block a document nobody can fix it in.
    orphans: answers.orphans.filter((o) => ids.has(o.qid)),
    settings: persisted.settings,
  };
}

/** Read the `content` column on its own — all the runner ever gets to see. */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  return {
    title: asString(record['title']),
    instruction: asString(record['instruction']),
    text: asString(record['text']),
    questions: readQuestions(record['questions']),
    settings: readSettings(record['settings']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const record = asRecord(expectedAnswers);
  const questions: PersistedAnswers['questions'] = {};
  for (const [id, raw] of Object.entries(asRecord(record['questions']))) {
    const key = asRecord(raw);
    questions[id] = {
      spans: readSpans(key['spans']),
      missHint: asString(key['missHint']),
      fpHint: asString(key['fpHint']),
    };
  }
  return { questions, orphans: readOrphans(record['orphans']) };
}

/** How many spans each question's key holds — all the projection may learn from the key. */
export function spanCounts(expectedAnswers: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, key] of Object.entries(readAnswers(expectedAnswers).questions)) out[id] = key.spans.length;
  return out;
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

function asOffset(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function readQuestions(value: unknown): PersistedQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    const unit = record['unit'];
    return {
      id: asString(record['id']),
      prompt: asString(record['prompt']),
      unit: (UNITS as readonly unknown[]).includes(unit) ? (unit as Unit) : 'word',
    };
  });
}

function readSpans(value: unknown): Span[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return {
      id: asString(record['id']),
      start: asOffset(record['start']),
      end: asOffset(record['end']),
      why: asString(record['why']),
    };
  });
}

function readOrphans(value: unknown): Orphan[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return {
      id: asString(record['id']),
      qid: asString(record['qid']),
      surface: asString(record['surface']),
      why: asString(record['why']),
    };
  });
}

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const attempts = record['attempts'];
  const threshold = record['threshold'];
  const penalty = record['penalty'];
  return {
    attempts: (ATTEMPTS as readonly unknown[]).includes(attempts) ? (attempts as Attempts) : DEFAULT_SETTINGS.attempts,
    // Clamped rather than defaulted: a threshold outside 0-100 is a bad number, not a missing
    // one, and silently restoring 70 would hide it from the author.
    threshold:
      typeof threshold === 'number' && Number.isFinite(threshold)
        ? Math.min(100, Math.max(0, Math.round(threshold)))
        : DEFAULT_SETTINGS.threshold,
    penalty: (PENALTIES as readonly unknown[]).includes(penalty) ? (penalty as Penalty) : DEFAULT_SETTINGS.penalty,
    showCount: asBoolean(record['showCount'], DEFAULT_SETTINGS.showCount),
    hints: asBoolean(record['hints'], DEFAULT_SETTINGS.hints),
    revealKey: asBoolean(record['revealKey'], DEFAULT_SETTINGS.revealKey),
  };
}
