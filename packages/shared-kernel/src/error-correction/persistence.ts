// How an `error_correction` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns and its own fields:
//
//   content          → mode, note, settings, and per item: id, wrong, hint
//   expected_answers → per item: ref, alts, meta (the author's span overrides), teacherNote
//   the row + its instruction row → id, module, title, instructions, updatedAt
//
// The split is the whole reason this file exists. The handoff's prototype keeps the
// document in one object because it runs entirely in a browser with no student in it;
// here `ref` *is* the answer, and the derived spans are the answer restated. Anything
// that would let a student compute the spans has to stay on the server — which is also
// why grading happens there (plan 41, phase 2) rather than in the reader.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown`, may
// predate the current shape, and must not throw. It coerces and fills defaults, leaving
// issues.ts to report what is actually missing.

import type {
  Ai,
  Check,
  ErrorCorrection,
  Flow,
  Hints,
  Item,
  Mode,
  SpanKey,
  SpanOverride,
  SpanType,
  StrayPolicy,
  StudentEdits,
} from './model.js';
import {
  DEFAULT_AI,
  DEFAULT_CHECK,
  DEFAULT_FLOW,
  DEFAULT_HINTS,
  SPAN_TYPES,
} from './model.js';

export const TEMPLATE_CODE = 'error_correction';

/** One item as the `content` column holds it — everything a student may see. */
export interface PersistedItem {
  id: string;
  wrong: string;
  hint?: string;
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  mode: Mode;
  note: string;
  items: PersistedItem[];
  hints: Hints;
  check: Check;
  flow: Flow;
  ai: Ai;
}

/** One item's answer key. */
export interface PersistedAnswerItem {
  ref: string;
  alts: string[];
  meta: Record<SpanKey, SpanOverride>;
  teacherNote?: string;
}

/** The `expected_answers` column: keyed by item id, so reordering items cannot shuffle it. */
export interface PersistedAnswers {
  items: Record<string, PersistedAnswerItem>;
}

/** The parts of the document the exercise row owns rather than its JSON columns. */
export interface DocumentEnvelope {
  id: string;
  moduleId: string;
  title: string;
  instructions: string;
  updatedAt: string;
}

export function toContent(ex: ErrorCorrection): PersistedContent {
  return {
    mode: ex.mode,
    note: ex.note,
    items: ex.items.map((item) => ({
      id: item.id,
      wrong: item.wrong,
      ...(item.hint === undefined || item.hint === '' ? {} : { hint: item.hint }),
    })),
    hints: ex.hints,
    check: ex.check,
    flow: ex.flow,
    ai: ex.ai,
  };
}

export function toExpectedAnswers(ex: ErrorCorrection): PersistedAnswers {
  const items: Record<string, PersistedAnswerItem> = {};

  for (const item of ex.items) {
    items[item.id] = {
      ref: item.ref,
      alts: item.alts,
      meta: item.meta,
      ...(item.teacherNote === undefined || item.teacherNote === ''
        ? {}
        : { teacherNote: item.teacherNote }),
    };
  }

  return { items };
}

export function fromPersisted(
  envelope: DocumentEnvelope,
  content: unknown,
  expectedAnswers: unknown,
): ErrorCorrection {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);

  return {
    ...envelope,
    type: TEMPLATE_CODE,
    mode: persisted.mode,
    note: persisted.note,
    hints: persisted.hints,
    check: persisted.check,
    flow: persisted.flow,
    ai: persisted.ai,
    items: persisted.items.map((item): Item => {
      const answer = answers.items[item.id];
      return {
        id: item.id,
        wrong: item.wrong,
        ref: answer?.ref ?? '',
        alts: answer?.alts ?? [],
        meta: answer?.meta ?? {},
        ...(item.hint === undefined ? {} : { hint: item.hint }),
        ...(answer?.teacherNote === undefined ? {} : { teacherNote: answer.teacherNote }),
      };
    }),
  };
}

/**
 * Read the `content` column on its own — what the student projection starts from, and
 * all the runner ever gets to see.
 */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  const mode = record['mode'];

  return {
    mode: mode === 'passage' || mode === 'sentences' ? mode : 'sentences',
    note: asString(record['note']),
    items: readItems(record['items']),
    hints: readHints(record['hints']),
    check: readCheck(record['check']),
    flow: readFlow(record['flow']),
    ai: readAi(record['ai']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const items: Record<string, PersistedAnswerItem> = {};

  for (const [id, raw] of Object.entries(asRecord(asRecord(expectedAnswers)['items']))) {
    const record = asRecord(raw);
    const teacherNote = record['teacherNote'];
    items[id] = {
      ref: asString(record['ref']),
      alts: readStringArray(record['alts']),
      meta: readMeta(record['meta']),
      ...(typeof teacherNote === 'string' ? { teacherNote } : {}),
    };
  }

  return { items };
}

/**
 * Read a submitted answer. The shape is three sparse maps keyed by word index, and it
 * arrives over the wire with string keys — `JSON.parse` cannot give numeric ones — so it
 * is coerced back here rather than in every reader.
 */
export function readEdits(value: unknown): StudentEdits {
  const record = asRecord(value);
  return {
    marked: readIndexMap(record['marked'], (raw) => raw === true),
    fix: readIndexMap(record['fix'], (raw) => (typeof raw === 'string' ? raw : undefined)),
    ins: readIndexMap(record['ins'], (raw) => (typeof raw === 'string' ? raw : undefined)),
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

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readItems(value: unknown): PersistedItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    const record = asRecord(raw);
    const hint = record['hint'];
    return {
      id: asString(record['id']),
      wrong: asString(record['wrong']),
      ...(typeof hint === 'string' ? { hint } : {}),
    };
  });
}

function readMeta(value: unknown): Record<SpanKey, SpanOverride> {
  const out: Record<SpanKey, SpanOverride> = {};

  for (const [key, raw] of Object.entries(asRecord(value))) {
    const record = asRecord(raw);
    const type = record['type'];
    const note = record['note'];
    const soft = record['soft'];
    out[key] = {
      ...(isSpanType(type) ? { type } : {}),
      ...(typeof note === 'string' ? { note } : {}),
      ...(typeof soft === 'boolean' ? { soft } : {}),
    };
  }

  return out;
}

const isSpanType = (value: unknown): value is SpanType =>
  typeof value === 'string' && (SPAN_TYPES as readonly string[]).includes(value);

function readHints(value: unknown): Hints {
  const record = asRecord(value);
  return {
    count: asBoolean(record['count'], DEFAULT_HINTS.count),
    mark: asBoolean(record['mark'], DEFAULT_HINTS.mark),
    hintText: asBoolean(record['hintText'], DEFAULT_HINTS.hintText),
    showType: asBoolean(record['showType'], DEFAULT_HINTS.showType),
  };
}

function readCheck(value: unknown): Check {
  const record = asRecord(value);
  const strayEdits = record['strayEdits'];

  return {
    on: asBoolean(record['on'], DEFAULT_CHECK.on),
    caseInsensitive: asBoolean(record['caseInsensitive'], DEFAULT_CHECK.caseInsensitive),
    ignorePunct: asBoolean(record['ignorePunct'], DEFAULT_CHECK.ignorePunct),
    typo: asBoolean(record['typo'], DEFAULT_CHECK.typo),
    near: asNumber(record['near'], DEFAULT_CHECK.near),
    exactPass: asBoolean(record['exactPass'], DEFAULT_CHECK.exactPass),
    strayEdits: isStrayPolicy(strayEdits) ? strayEdits : DEFAULT_CHECK.strayEdits,
    requireAllSpans: asBoolean(record['requireAllSpans'], DEFAULT_CHECK.requireAllSpans),
  };
}

const isStrayPolicy = (value: unknown): value is StrayPolicy =>
  value === 'ignore' || value === 'flag' || value === 'block';

function readFlow(value: unknown): Flow {
  const record = asRecord(value);
  const attempts = record['attempts'];
  const showRefs = record['showRefs'];
  // 0–3 by the handoff; a stored 7 would hand out unlimited self-checks.
  const selfCheck = Math.max(0, Math.min(3, Math.trunc(asNumber(record['selfCheck'], DEFAULT_FLOW.selfCheck))));

  return {
    selfCheck,
    attempts: attempts === 'once' || attempts === 'free' ? attempts : DEFAULT_FLOW.attempts,
    showRefs:
      showRefs === 'afterGraded' || showRefs === 'afterSubmit' || showRefs === 'never'
        ? showRefs
        : DEFAULT_FLOW.showRefs,
    keyboard: asBoolean(record['keyboard'], DEFAULT_FLOW.keyboard),
    perSentence: asBoolean(record['perSentence'], DEFAULT_FLOW.perSentence),
    showSpanCount: asBoolean(record['showSpanCount'], DEFAULT_FLOW.showSpanCount),
  };
}

function readAi(value: unknown): Ai {
  const record = asRecord(value);
  const checks = asRecord(record['checks']);
  const visibility = record['visibility'];

  return {
    on: asBoolean(record['on'], DEFAULT_AI.on),
    checks: {
      explainWhy: asBoolean(checks['explainWhy'], DEFAULT_AI.checks.explainWhy),
      altFixes: asBoolean(checks['altFixes'], DEFAULT_AI.checks.altFixes),
      register: asBoolean(checks['register'], DEFAULT_AI.checks.register),
    },
    visibility:
      visibility === 'teacher' || visibility === 'studentBefore' || visibility === 'studentAfter'
        ? visibility
        : DEFAULT_AI.visibility,
  };
}

function readIndexMap<T>(value: unknown, coerce: (raw: unknown) => T | undefined): Record<number, T> {
  const out: Record<number, T> = {};

  for (const [key, raw] of Object.entries(asRecord(value))) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0) continue;
    const coerced = coerce(raw);
    if (coerced === undefined || coerced === false) continue;
    out[index] = coerced;
  }

  return out;
}
