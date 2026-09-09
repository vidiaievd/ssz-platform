// How a `multiple_choice` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns:
//
//   content          → title, instruction, settings, and per question:
//                       id, kind, context, stem, and each option's id, text and `fixed`
//   expected_answers → per question: which option is the key, the rule behind it, and
//                       each wrong option's rebuttal
//
// Which option is correct is the whole answer to this exercise, so it lives on the key
// side and the content column carries no trace of it — not a flag, not an order. The
// projection layer cannot leak by omission: there is nothing there to forget to strip.
//
// The rebuttals travel with the key for the same reason `short_answer` keeps `why` there:
// they are shown after a pick, and «this is wrong because…» on four of five options
// identifies the fifth.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown`, may
// predate the current shape, and must not throw. It coerces and fills defaults, leaving
// issues.ts to report what is actually missing.
//
// ── Two families under one template code ────────────────────────────────────
// Plan 53 §3.9: the old single-question form (`content.question` plus
// `expectedAnswers.correct_option_ids`) stays live — 121 of the 131 seeded exercises are
// written in it. `isMultipleChoiceDocument` is how every dispatching surface — the
// validator, the runners, the projection, the content preview — tells the two apart. It
// asks for `questions` being an array and nothing else: an old document has no such field,
// and a new one always does, even while empty.

import type {
  Layout,
  MultipleChoiceContent,
  Option,
  Question,
  QuestionKind,
  RetryPolicy,
  Settings,
} from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

export const TEMPLATE_CODE = 'multiple_choice';

/** One option as the `content` column holds it — the text, never whether it is right. */
export interface PersistedOption {
  id: string;
  text: string;
  fixed: boolean;
}

/** One question as the `content` column holds it. */
export interface PersistedQuestion {
  id: string;
  kind: QuestionKind;
  context: string;
  stem: string;
  options: PersistedOption[];
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  questions: PersistedQuestion[];
  settings: Settings;
}

/** One question's key. `options` maps an option id to its rebuttal. */
export interface PersistedKey {
  correctOptionId: string;
  why: string;
  options: Record<string, string>;
}

/** The `expected_answers` column. Keyed by question id, so reordering cannot shuffle it. */
export interface PersistedAnswers {
  questions: Record<string, PersistedKey>;
}

export function toContent(ex: MultipleChoiceContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    questions: ex.questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      context: q.context,
      stem: q.stem,
      // Empty options are persisted as authored — the teacher must be able to leave and
      // come back mid-write (IMPLEMENTATION.md, "Persistence"). They are dropped in the
      // projection instead.
      options: q.options.map((o) => ({ id: o.id, text: o.text, fixed: o.fixed })),
    })),
    settings: ex.settings,
  };
}

export function toExpectedAnswers(ex: MultipleChoiceContent): PersistedAnswers {
  const questions: PersistedAnswers['questions'] = {};
  for (const q of ex.questions) {
    const options: Record<string, string> = {};
    for (const o of q.options) if (o.why.trim() !== '') options[o.id] = o.why;
    questions[q.id] = {
      correctOptionId: q.options.find((o) => o.correct)?.id ?? '',
      why: q.why,
      options,
    };
  }
  return { questions };
}

export function fromPersisted(content: unknown, expectedAnswers: unknown): MultipleChoiceContent {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);

  return {
    title: persisted.title,
    instruction: persisted.instruction,
    settings: persisted.settings,
    questions: persisted.questions.map((q): Question => {
      const key = answers.questions[q.id];
      return {
        id: q.id,
        kind: q.kind,
        context: q.context,
        stem: q.stem,
        options: q.options.map(
          (o): Option => ({
            id: o.id,
            text: o.text,
            fixed: o.fixed,
            correct: key?.correctOptionId === o.id,
            why: key?.options[o.id] ?? '',
          }),
        ),
        why: key?.why ?? '',
      };
    }),
  };
}

/**
 * Is this a document of the new form?
 *
 * Deliberately structural rather than a version field: the 121 documents of the old form
 * were written before any version existed, so a field could only ever be absent there —
 * which is the same test, spelled less honestly.
 */
export function isMultipleChoiceDocument(content: unknown): boolean {
  return Array.isArray(asRecord(content)['questions']);
}

/** Read the `content` column on its own — all the runner ever gets to see. */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  return {
    title: asString(record['title']),
    instruction: asString(record['instruction']),
    questions: readQuestions(record['questions']),
    settings: readSettings(record['settings']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const questions: PersistedAnswers['questions'] = {};
  for (const [id, raw] of Object.entries(asRecord(asRecord(expectedAnswers)['questions']))) {
    const record = asRecord(raw);
    const options: Record<string, string> = {};
    for (const [optionId, why] of Object.entries(asRecord(record['options']))) {
      if (typeof why === 'string') options[optionId] = why;
    }
    questions[id] = {
      correctOptionId: asString(record['correctOptionId']),
      why: asString(record['why']),
      options,
    };
  }
  return { questions };
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

const KIND_IDS: readonly QuestionKind[] = ['grammar', 'vocab', 'reading', 'listening'];
const isKind = (value: unknown): value is QuestionKind =>
  typeof value === 'string' && (KIND_IDS as readonly string[]).includes(value);

const isRetry = (value: unknown): value is RetryPolicy =>
  value === 'none' || value === 'one' || value === 'unlimited';

const isLayout = (value: unknown): value is Layout => value === 'list' || value === 'grid';

function readQuestions(value: unknown): PersistedQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    const kind = record['kind'];
    return {
      id: asString(record['id']),
      kind: isKind(kind) ? kind : 'grammar',
      context: asString(record['context']),
      stem: asString(record['stem']),
      options: readOptions(record['options']),
    };
  });
}

function readOptions(value: unknown): PersistedOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return {
      id: asString(record['id']),
      text: asString(record['text']),
      fixed: asBoolean(record['fixed'], false),
    };
  });
}

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const retry = record['retry'];
  const layout = record['layout'];

  return {
    letters: asBoolean(record['letters'], DEFAULT_SETTINGS.letters),
    layout: isLayout(layout) ? layout : DEFAULT_SETTINGS.layout,
    shuffle: asBoolean(record['shuffle'], DEFAULT_SETTINGS.shuffle),
    shuffleQuestions: asBoolean(record['shuffleQuestions'], DEFAULT_SETTINGS.shuffleQuestions),
    instant: asBoolean(record['instant'], DEFAULT_SETTINGS.instant),
    retry: isRetry(retry) ? retry : DEFAULT_SETTINGS.retry,
    eliminate: asBoolean(record['eliminate'], DEFAULT_SETTINGS.eliminate),
    showWhyWrong: asBoolean(record['showWhyWrong'], DEFAULT_SETTINGS.showWhyWrong),
    explainOnCorrect: asBoolean(record['explainOnCorrect'], DEFAULT_SETTINGS.explainOnCorrect),
    progress: asBoolean(record['progress'], DEFAULT_SETTINGS.progress),
  };
}
