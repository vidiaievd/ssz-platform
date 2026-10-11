// How an `information_transfer` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns:
//
//   content          → title, instruction, language, the source switch, focus, the passage, the
//                       audio block, the form, per field everything but its answer, and the
//                       grading, answering and scoring settings
//   expected_answers → per field, by id: the expected wordings and the explanation
//
// The prototype's model comment: «The key (`expected`, `why`) lives in expected_answers and only
// ever leaves the server inside a verdict.» The transcript of a recording stays in the audio block,
// as for every listening type: the layer's projection holds it back by its own policy.
//
// `audio.enabled` is not the author's to set separately: it is written from `sourceKind`
// (plan 73 §3.1), so the one switch of step 1 is the only one there is.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown` and must not
// throw. It coerces and fills defaults, leaving issues.ts to report what is missing.

import type { ExerciseAudio, ItemAudio } from '../audio/model.js';
import { audioOf } from '../audio/model.js';
import type {
  Answering,
  Attempts,
  FieldType,
  Form,
  Grading,
  HintsAfter,
  InfFocus,
  InformationTransferContent,
  Layout,
  Memory,
  RevealKey,
  Scoring,
  ShowSource,
  SourceKind,
} from './model.js';
import {
  ATTEMPTS,
  DEFAULT_ANSWERING,
  DEFAULT_FORM,
  DEFAULT_GRADING,
  DEFAULT_SCORING,
  FIELD_TYPES,
  FOCUSES,
  HINTS_AFTER,
  LAYOUTS,
  MEMORIES,
  REVEAL_KEYS,
  SHOW_SOURCES,
  SOURCE_KINDS,
} from './model.js';

export const TEMPLATE_CODE = 'information_transfer';

/** One field as the `content` column holds it — never its answer or its explanation. */
export interface PersistedField {
  id: string;
  label: string;
  hint: string;
  type: FieldType;
  unit: string;
  required: boolean;
  /** The layer's per-item timecode; absent when the field has none. */
  audio?: ItemAudio;
}

/** The `content` column. Carries no key, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  language: string;
  sourceKind: SourceKind;
  focus: InfFocus;
  passageTitle: string;
  passage: string;
  audio: ExerciseAudio;
  form: Form;
  fields: PersistedField[];
  grading: Grading;
  answering: Answering;
  scoring: Scoring;
}

export interface PersistedKey {
  expected: string[];
  why: string;
}

/** The `expected_answers` column, keyed by field id so reordering cannot shuffle it. */
export interface PersistedAnswers {
  fields: Record<string, PersistedKey>;
}

export function toContent(ex: InformationTransferContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    language: ex.language,
    sourceKind: ex.sourceKind,
    focus: ex.focus,
    passageTitle: ex.passageTitle,
    passage: ex.passage,
    audio: {
      ...ex.audio,
      enabled: ex.sourceKind === 'audio',
      settings: { ...ex.audio.settings },
    },
    form: { ...ex.form },
    // Unfinished fields are persisted as written — the teacher must be able to leave and come
    // back mid-form. The projection drops them.
    fields: ex.fields.map((f) => ({
      id: f.id,
      label: f.label,
      hint: f.hint,
      type: f.type,
      unit: f.unit,
      required: f.required,
      ...(f.audio === null ? {} : { audio: { ...f.audio } }),
    })),
    grading: { ...ex.grading },
    answering: { ...ex.answering },
    scoring: { ...ex.scoring },
  };
}

export function toExpectedAnswers(ex: InformationTransferContent): PersistedAnswers {
  const fields: PersistedAnswers['fields'] = {};
  for (const f of ex.fields) fields[f.id] = { expected: [...f.expected], why: f.why };
  return { fields };
}

export function fromPersisted(
  content: unknown,
  expectedAnswers: unknown,
): InformationTransferContent {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);
  return {
    ...persisted,
    fields: persisted.fields.map((f) => {
      const key = answers.fields[f.id];
      return {
        id: f.id,
        label: f.label,
        hint: f.hint,
        type: f.type,
        unit: f.unit,
        required: f.required,
        audio: f.audio ?? null,
        expected: key && key.expected.length > 0 ? key.expected : [''],
        why: key?.why ?? '',
      };
    }),
  };
}

/** Read the `content` column on its own — all the runner ever gets to see. */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  const sourceKind = oneOf(record['sourceKind'], SOURCE_KINDS, 'text');
  return {
    title: asString(record['title']),
    instruction: asString(record['instruction']),
    language: asString(record['language']),
    sourceKind,
    focus: oneOf(record['focus'], FOCUSES, 'pragmatics'),
    passageTitle: asString(record['passageTitle']),
    passage: asString(record['passage']),
    audio: { ...audioOf(content), enabled: sourceKind === 'audio' },
    form: readForm(record['form']),
    fields: readFields(record['fields']),
    grading: readGrading(record['grading']),
    answering: readAnswering(record['answering']),
    scoring: readScoring(record['scoring']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const fields: PersistedAnswers['fields'] = {};
  for (const [id, raw] of Object.entries(asRecord(asRecord(expectedAnswers)['fields']))) {
    const key = asRecord(raw);
    const expected = key['expected'];
    fields[id] = {
      expected: Array.isArray(expected)
        ? expected.filter((v): v is string => typeof v === 'string')
        : [],
      why: asString(key['why']),
    };
  }
  return { fields };
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

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
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

function readForm(value: unknown): Form {
  const r = asRecord(value);
  return {
    formTitle: asString(r['formTitle']),
    layout: oneOf<Layout>(r['layout'], LAYOUTS, DEFAULT_FORM.layout),
  };
}

function readFields(value: unknown): PersistedField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): PersistedField[] => {
    const r = asRecord(raw);
    const id = asString(r['id']);
    if (id === '') return [];
    const audio = readItemAudio(r['audio']);
    return [
      {
        id,
        label: asString(r['label']),
        hint: asString(r['hint']),
        type: oneOf<FieldType>(r['type'], FIELD_TYPES, 'word'),
        unit: asString(r['unit']),
        required: asBoolean(r['required'], true),
        ...(audio === undefined ? {} : { audio }),
      },
    ];
  });
}

function readGrading(value: unknown): Grading {
  const r = asRecord(value);
  const d = DEFAULT_GRADING;
  return {
    spelledNumbers: asBoolean(r['spelledNumbers'], d.spelledNumbers),
    typos: asBoolean(r['typos'], d.typos),
    strictCase: asBoolean(r['strictCase'], d.strictCase),
    requiredAll: asBoolean(r['requiredAll'], d.requiredAll),
  };
}

function readAnswering(value: unknown): Answering {
  const r = asRecord(value);
  const d = DEFAULT_ANSWERING;
  return {
    showSource: oneOf<ShowSource>(r['showSource'], SHOW_SOURCES, d.showSource),
    oneAtATime: asBoolean(r['oneAtATime'], d.oneAtATime),
    hintsAfter: oneOf<HintsAfter>(r['hintsAfter'], HINTS_AFTER, d.hintsAfter),
    revealKey: oneOf<RevealKey>(r['revealKey'], REVEAL_KEYS, d.revealKey),
    attempts: oneOf<Attempts>(r['attempts'], ATTEMPTS, d.attempts),
  };
}

function readScoring(value: unknown): Scoring {
  const r = asRecord(value);
  const d = DEFAULT_SCORING;
  const pct = r['passPct'];
  return {
    passPct:
      typeof pct === 'number' && Number.isFinite(pct)
        ? Math.max(0, Math.min(100, Math.round(pct)))
        : d.passPct,
    memory: oneOf<Memory>(r['memory'], MEMORIES, d.memory),
    logWordExposure: asBoolean(r['logWordExposure'], d.logWordExposure),
  };
}
