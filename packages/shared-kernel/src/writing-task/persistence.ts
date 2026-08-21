// How a `writing_task` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns and its own fields:
//
//   content          → mode, instruction, prompt, source, image, letter, phrases, settings,
//                       and per point: id, text, required; per criterion: id, name, desc,
//                       weight, metric
//   expected_answers → per point: keywords; per criterion: levels; the example answer
//   the row          → id, module, title, updatedAt
//
// The split follows IMPLEMENTATION.md's rule verbatim: "the example answer, the level
// descriptors and the point keywords must never reach the student client before the
// teacher has graded." Keeping them out of `content` means the projection layer
// (projection.ts) cannot leak them by omission — there is nothing to forget to strip.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown`, may
// predate the current shape, and must not throw. It coerces and fills defaults, leaving
// issues.ts to report what is actually missing.

import type {
  Ai,
  AiSelfLimit,
  AiVisibility,
  Criterion,
  CriterionMetric,
  Image,
  Letter,
  LetterRegister,
  Mode,
  Point,
  RevisionPolicy,
  Settings,
  ShowModelPolicy,
  ShowRubricPolicy,
  WritingTask,
} from './model.js';
import { DEFAULT_AI, DEFAULT_SETTINGS } from './model.js';

export const TEMPLATE_CODE = 'writing_task';

/** One point as the `content` column holds it — the checklist item, never the answer. */
export interface PersistedPoint {
  id: string;
  text: string;
  required: boolean;
}

/** One criterion as the `content` column holds it — everything but the level descriptors. */
export interface PersistedCriterion {
  id: string;
  name: string;
  desc: string;
  weight: 1 | 2;
  metric: CriterionMetric;
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  mode: Mode;
  instruction: string;
  prompt: string;
  source: string;
  image: Image;
  letter: Letter;
  points: PersistedPoint[];
  phrases: string[];
  rubric: PersistedCriterion[];
  settings: Settings;
}

/** The `expected_answers` column. Keyed by id, so reordering points or criteria cannot shuffle it. */
export interface PersistedAnswers {
  points: Record<string, { keywords: string[] }>;
  rubric: Record<string, { levels: readonly [string, string, string, string] }>;
  model: string;
}

/** The parts of the document the exercise row owns rather than its JSON columns. */
export interface DocumentEnvelope {
  id: string;
  moduleId: string;
  title: string;
  updatedAt: string;
}

export function toContent(ex: WritingTask): PersistedContent {
  return {
    mode: ex.mode,
    instruction: ex.instruction,
    prompt: ex.prompt,
    source: ex.source,
    image: ex.image,
    letter: ex.letter,
    points: ex.points.map((point) => ({ id: point.id, text: point.text, required: point.required })),
    phrases: ex.phrases,
    rubric: ex.rubric.map((c) => ({ id: c.id, name: c.name, desc: c.desc, weight: c.weight, metric: c.metric })),
    settings: ex.settings,
  };
}

export function toExpectedAnswers(ex: WritingTask): PersistedAnswers {
  const points: PersistedAnswers['points'] = {};
  for (const point of ex.points) points[point.id] = { keywords: point.keywords };

  const rubric: PersistedAnswers['rubric'] = {};
  for (const c of ex.rubric) rubric[c.id] = { levels: c.levels };

  return { points, rubric, model: ex.model };
}

export function fromPersisted(envelope: DocumentEnvelope, content: unknown, expectedAnswers: unknown): WritingTask {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);

  return {
    ...envelope,
    type: TEMPLATE_CODE,
    mode: persisted.mode,
    instruction: persisted.instruction,
    prompt: persisted.prompt,
    source: persisted.source,
    image: persisted.image,
    letter: persisted.letter,
    phrases: persisted.phrases,
    settings: persisted.settings,
    model: answers.model,
    points: persisted.points.map((point): Point => ({
      id: point.id,
      text: point.text,
      required: point.required,
      keywords: answers.points[point.id]?.keywords ?? [],
    })),
    rubric: persisted.rubric.map((c): Criterion => ({
      id: c.id,
      name: c.name,
      desc: c.desc,
      weight: c.weight,
      metric: c.metric,
      levels: answers.rubric[c.id]?.levels ?? ['', '', '', ''],
    })),
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
    mode: isMode(mode) ? mode : 'letter',
    instruction: asString(record['instruction']),
    prompt: asString(record['prompt']),
    source: asString(record['source']),
    image: readImage(record['image']),
    letter: readLetter(record['letter']),
    points: readPoints(record['points']),
    phrases: readStringArray(record['phrases']),
    rubric: readRubric(record['rubric']),
    settings: readSettings(record['settings']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const record = asRecord(expectedAnswers);
  const points: PersistedAnswers['points'] = {};
  for (const [id, raw] of Object.entries(asRecord(record['points']))) {
    points[id] = { keywords: readStringArray(asRecord(raw)['keywords']) };
  }

  const rubric: PersistedAnswers['rubric'] = {};
  for (const [id, raw] of Object.entries(asRecord(record['rubric']))) {
    rubric[id] = { levels: readLevels(asRecord(raw)['levels']) };
  }

  return { points, rubric, model: asString(record['model']) };
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

const MODES: readonly Mode[] = ['letter', 'essay', 'picture', 'retell', 'free'];
const isMode = (value: unknown): value is Mode => typeof value === 'string' && (MODES as readonly string[]).includes(value);

const METRICS: readonly Exclude<CriterionMetric, null>[] = ['points', 'paragraphs', 'language', 'lexis'];
const isMetric = (value: unknown): value is CriterionMetric =>
  value === null || (typeof value === 'string' && (METRICS as readonly string[]).includes(value));

const isWeight = (value: unknown): value is 1 | 2 => value === 1 || value === 2;

function readImage(value: unknown): Image {
  const record = asRecord(value);
  const assetId = record['assetId'];
  return {
    ...(typeof assetId === 'string' && assetId !== '' ? { assetId } : {}),
    caption: asString(record['caption']),
    alt: asString(record['alt']),
  };
}

function readLetter(value: unknown): Letter {
  const record = asRecord(value);
  const register = record['register'];
  return {
    register: isLetterRegister(register) ? register : 'formal',
    recipient: asString(record['recipient']),
  };
}

const isLetterRegister = (value: unknown): value is LetterRegister => value === 'formal' || value === 'informal';

function readPoints(value: unknown): PersistedPoint[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    const record = asRecord(raw);
    return {
      id: asString(record['id']),
      text: asString(record['text']),
      required: asBoolean(record['required'], true),
    };
  });
}

function readRubric(value: unknown): PersistedCriterion[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    const record = asRecord(raw);
    const weight = record['weight'];
    const metric = record['metric'];
    return {
      id: asString(record['id']),
      name: asString(record['name']),
      desc: asString(record['desc']),
      weight: isWeight(weight) ? weight : 1,
      metric: isMetric(metric) ? metric : null,
    };
  });
}

function readLevels(value: unknown): readonly [string, string, string, string] {
  const arr = readStringArray(value);
  return [arr[0] ?? '', arr[1] ?? '', arr[2] ?? '', arr[3] ?? ''];
}

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const showRubric = record['showRubric'];
  const showModel = record['showModel'];
  const aiVisibility = record['aiVisibility'];
  const aiSelfLimit = record['aiSelfLimit'];
  const revision = record['revision'];

  return {
    minWords: asNumber(record['minWords'], DEFAULT_SETTINGS.minWords),
    maxWords: asNumber(record['maxWords'], DEFAULT_SETTINGS.maxWords),
    timer: asNumber(record['timer'], DEFAULT_SETTINGS.timer),
    blockPaste: asBoolean(record['blockPaste'], DEFAULT_SETTINGS.blockPaste),
    autosave: asBoolean(record['autosave'], DEFAULT_SETTINGS.autosave),
    showWordCount: asBoolean(record['showWordCount'], DEFAULT_SETTINGS.showWordCount),
    showPlan: asBoolean(record['showPlan'], DEFAULT_SETTINGS.showPlan),
    showPhrases: asBoolean(record['showPhrases'], DEFAULT_SETTINGS.showPhrases),
    showRubric: isShowRubricPolicy(showRubric) ? showRubric : DEFAULT_SETTINGS.showRubric,
    showModel: isShowModelPolicy(showModel) ? showModel : DEFAULT_SETTINGS.showModel,
    passScore: asNumber(record['passScore'], DEFAULT_SETTINGS.passScore),
    aiStage: asBoolean(record['aiStage'], DEFAULT_SETTINGS.aiStage),
    ai: readAi(record['ai']),
    aiVisibility: isAiVisibility(aiVisibility) ? aiVisibility : DEFAULT_SETTINGS.aiVisibility,
    // 0–3 by the handoff; a stored 7 would hand out unlimited self-checks.
    aiSelfLimit: (Math.max(0, Math.min(3, Math.trunc(asNumber(aiSelfLimit, DEFAULT_SETTINGS.aiSelfLimit)))) as AiSelfLimit),
    revision: isRevisionPolicy(revision) ? revision : DEFAULT_SETTINGS.revision,
  };
}

function readAi(value: unknown): Ai {
  const record = asRecord(value);
  return {
    grammar: asBoolean(record['grammar'], DEFAULT_AI.grammar),
    task: asBoolean(record['task'], DEFAULT_AI.task),
    structure: asBoolean(record['structure'], DEFAULT_AI.structure),
    lexis: asBoolean(record['lexis'], DEFAULT_AI.lexis),
    draft: asBoolean(record['draft'], DEFAULT_AI.draft),
  };
}

const isShowRubricPolicy = (value: unknown): value is ShowRubricPolicy =>
  value === 'always' || value === 'afterGraded' || value === 'never';

const isShowModelPolicy = (value: unknown): value is ShowModelPolicy =>
  value === 'afterGraded' || value === 'never';

const isAiVisibility = (value: unknown): value is AiVisibility =>
  value === 'teacher' || value === 'studentBefore' || value === 'studentAfter';

const isRevisionPolicy = (value: unknown): value is RevisionPolicy =>
  value === 'once' || value === 'return' || value === 'drafts';
