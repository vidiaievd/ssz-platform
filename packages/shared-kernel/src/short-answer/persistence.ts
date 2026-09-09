// How a `short_answer` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns:
//
//   content          → title, instruction, settings, and per question:
//                       id, kind, passage, prompt
//   expected_answers → per question: elements (label, anchors, required), model, why
//
// The split follows IMPLEMENTATION.md's rule verbatim: "the key here (`elements`,
// `anchors`, `model`) must never reach the student client — the anchors are literally
// the answer." Keeping the key out of `content` means the projection layer
// (projection.ts) cannot leak it by omission: there is nothing there to forget to strip.
//
// `why` sits on the key side for the same reason it is only shown after submitting — it
// explains what the answer had to say, which is the answer.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown`, may
// predate the current shape, and must not throw. It coerces and fills defaults, leaving
// issues.ts to report what is actually missing.
//
// ── Two families under one template code ────────────────────────────────────
// Plan 51 §8 Q1: the old single-question form (`content.question` plus
// `expectedAnswers.accepted_answers`) stays live until the whole catalogue is rewritten.
// `isShortAnswerDocument` is how every dispatching surface — the validator, the runners,
// the content preview — tells the two apart. It asks for `questions` being an array and
// nothing else: an old document has no such field, and a new one always does, even
// while empty.

import type {
  KeyElement,
  PassRule,
  Question,
  QuestionKind,
  Settings,
  ShortAnswerContent,
  ShowModelPolicy,
  TeacherReviewPolicy,
} from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

export const TEMPLATE_CODE = 'short_answer';

/** One question as the `content` column holds it — the question, never the answer. */
export interface PersistedQuestion {
  id: string;
  kind: QuestionKind;
  passage: string;
  prompt: string;
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  questions: PersistedQuestion[];
  settings: Settings;
}

/** One question's key. */
export interface PersistedKey {
  elements: KeyElement[];
  model: string;
  why: string;
}

/** The `expected_answers` column. Keyed by question id, so reordering cannot shuffle it. */
export interface PersistedAnswers {
  questions: Record<string, PersistedKey>;
}

export function toContent(ex: ShortAnswerContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    questions: ex.questions.map((q) => ({ id: q.id, kind: q.kind, passage: q.passage, prompt: q.prompt })),
    settings: ex.settings,
  };
}

export function toExpectedAnswers(ex: ShortAnswerContent): PersistedAnswers {
  const questions: PersistedAnswers['questions'] = {};
  for (const q of ex.questions) {
    questions[q.id] = { elements: q.elements, model: q.model, why: q.why };
  }
  return { questions };
}

export function fromPersisted(content: unknown, expectedAnswers: unknown): ShortAnswerContent {
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
        passage: q.passage,
        prompt: q.prompt,
        elements: key?.elements ?? [],
        model: key?.model ?? '',
        why: key?.why ?? '',
      };
    }),
  };
}

/**
 * Is this a document of the new form?
 *
 * Deliberately structural rather than a version field: the 144 documents of the old
 * form were written before any version existed, so a field could only ever be absent
 * there — which is the same test, spelled less honestly.
 */
export function isShortAnswerDocument(content: unknown): boolean {
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
    questions[id] = {
      elements: readElements(record['elements']),
      model: asString(record['model']),
      why: asString(record['why']),
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

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const KIND_IDS: readonly QuestionKind[] = ['reading', 'listening', 'opinion'];
const isKind = (value: unknown): value is QuestionKind =>
  typeof value === 'string' && (KIND_IDS as readonly string[]).includes(value);

function readQuestions(value: unknown): PersistedQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    const kind = record['kind'];
    return {
      id: asString(record['id']),
      kind: isKind(kind) ? kind : 'reading',
      passage: asString(record['passage']),
      prompt: asString(record['prompt']),
    };
  });
}

function readElements(value: unknown): KeyElement[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return {
      id: asString(record['id']),
      label: asString(record['label']),
      anchors: readStringArray(record['anchors']),
      required: asBoolean(record['required'], true),
    };
  });
}

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const passRule = record['passRule'];
  const showModel = record['showModel'];
  const teacherReview = record['teacherReview'];

  return {
    passRule: isPassRule(passRule) ? passRule : DEFAULT_SETTINGS.passRule,
    // 1-3 by the handoff; a stored 9 would make every question unpassable.
    passN: clamp(asNumber(record['passN'], DEFAULT_SETTINGS.passN), 1, 3),
    typos: asBoolean(record['typos'], DEFAULT_SETTINGS.typos),
    caseless: asBoolean(record['caseless'], DEFAULT_SETTINGS.caseless),
    minWords: Math.max(0, Math.trunc(asNumber(record['minWords'], DEFAULT_SETTINGS.minWords))),
    showBreakdown: asBoolean(record['showBreakdown'], DEFAULT_SETTINGS.showBreakdown),
    showModel: isShowModel(showModel) ? showModel : DEFAULT_SETTINGS.showModel,
    aiStage: asBoolean(record['aiStage'], DEFAULT_SETTINGS.aiStage),
    aiGrammar: asBoolean(record['aiGrammar'], DEFAULT_SETTINGS.aiGrammar),
    teacherReview: isTeacherReview(teacherReview) ? teacherReview : DEFAULT_SETTINGS.teacherReview,
    progress: asBoolean(record['progress'], DEFAULT_SETTINGS.progress),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

const isPassRule = (value: unknown): value is PassRule => value === 'all' || value === 'n';

const isShowModel = (value: unknown): value is ShowModelPolicy =>
  value === 'always' || value === 'onClose' || value === 'never';

const isTeacherReview = (value: unknown): value is TeacherReviewPolicy =>
  value === 'all' || value === 'flagged' || value === 'none';
