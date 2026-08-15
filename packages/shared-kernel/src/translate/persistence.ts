// How a translate document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns and its own fields:
//
//   content          → dir, langs, format, note, settings, and per item:
//                      id, dir, source, hint, gloss, mediaId
//   expected_answers → per item: refs, require, forbid, explanation, teacherNote
//   the row + its instruction row → id, module, title, instructions, updatedAt
//
// The split is the whole reason this file exists. The handoff's prototype keeps the
// document in one object because it runs entirely in a browser with no student in it;
// here `refs` *is* the answer. So are the guards: `require: ["har bodd"]` hands over two
// words of the key, and `forbid` names the trap. They stay on the server and reach the
// student only through projection.ts, one fired guard at a time.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown`, may
// predate the current shape, and must not throw. It coerces and fills defaults, leaving
// issues.ts to report what is actually missing.

import type {
  Ai,
  Check,
  Direction,
  Flow,
  Format,
  Gloss,
  Guard,
  Item,
  ItemDirection,
  Langs,
  Translate,
  TranslateType,
} from './model.js';
import { DEFAULT_AI, DEFAULT_CHECK, DEFAULT_FLOW, TRANSLATE_TYPES } from './model.js';

/**
 * A mixed set is stored under `translate_to_target` (plan 42, decision 3), so the stored
 * code does not determine `dir` — `content.dir` does.
 */
export const templateCode = (dir: Direction): TranslateType =>
  dir === 'from_target' ? 'translate_from_target' : 'translate_to_target';

/** The direction a freshly read document starts from when `content` carries none. */
export const dirForCode = (code: TranslateType): Direction =>
  code === 'translate_from_target' ? 'from_target' : 'to_target';

/** One item as the `content` column holds it — everything a student may see. */
export interface PersistedItem {
  id: string;
  dir: ItemDirection;
  source: string;
  hint?: string;
  gloss: Gloss[];
  mediaId?: string;
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  dir: Direction;
  langs: Langs;
  format: Format;
  note: string;
  items: PersistedItem[];
  check: Check;
  flow: Flow;
  ai: Ai;
}

/** One item's answer key, with everything derived from it. */
export interface PersistedAnswerItem {
  refs: string[];
  require: Guard[];
  forbid: Guard[];
  explanation?: string;
  teacherNote?: string;
}

/** The `expected_answers` column: keyed by item id, so reordering cannot shuffle it. */
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

/** One sentence of a submission. The set is submitted in one go. */
export interface SubmittedItem {
  itemId: string;
  text: string;
}

export const DEFAULT_LANGS: Langs = { explain: 'Russisk', target: 'Norsk' };

export function toContent(ex: Translate): PersistedContent {
  return {
    dir: ex.dir,
    langs: ex.langs,
    format: ex.format,
    note: ex.note,
    items: ex.items.map((item) => ({
      id: item.id,
      dir: item.dir,
      source: item.source,
      ...(item.hint === undefined || item.hint === '' ? {} : { hint: item.hint }),
      gloss: item.gloss.filter((entry) => entry.w.trim() !== '' || entry.t.trim() !== ''),
      ...(item.mediaId === undefined || item.mediaId === '' ? {} : { mediaId: item.mediaId }),
    })),
    check: ex.check,
    flow: ex.flow,
    ai: ex.ai,
  };
}

export function toExpectedAnswers(ex: Translate): PersistedAnswers {
  const items: Record<string, PersistedAnswerItem> = {};

  for (const item of ex.items) {
    items[item.id] = {
      refs: item.refs.filter((ref) => ref.trim() !== ''),
      require: cleanGuards(item.require),
      forbid: cleanGuards(item.forbid),
      ...(item.explanation === undefined || item.explanation === ''
        ? {}
        : { explanation: item.explanation }),
      ...(item.teacherNote === undefined || item.teacherNote === ''
        ? {}
        : { teacherNote: item.teacherNote }),
    };
  }

  return { items };
}

export function fromPersisted(
  envelope: DocumentEnvelope,
  code: TranslateType,
  content: unknown,
  expectedAnswers: unknown,
): Translate {
  const persisted = readContent(content, code);
  const answers = readAnswers(expectedAnswers);

  return {
    ...envelope,
    type: code,
    dir: persisted.dir,
    langs: persisted.langs,
    format: persisted.format,
    note: persisted.note,
    check: persisted.check,
    flow: persisted.flow,
    ai: persisted.ai,
    items: persisted.items.map((item): Item => {
      const answer = answers.items[item.id];
      return {
        id: item.id,
        dir: item.dir,
        source: item.source,
        refs: answer?.refs ?? [],
        gloss: item.gloss,
        require: answer?.require ?? [],
        forbid: answer?.forbid ?? [],
        ...(item.hint === undefined ? {} : { hint: item.hint }),
        ...(item.mediaId === undefined ? {} : { mediaId: item.mediaId }),
        ...(answer?.explanation === undefined ? {} : { explanation: answer.explanation }),
        ...(answer?.teacherNote === undefined ? {} : { teacherNote: answer.teacherNote }),
      };
    }),
  };
}

/**
 * Read the `content` column on its own — what the student projection starts from, and all
 * the runner ever gets to see.
 */
export function readContent(content: unknown, code?: TranslateType): PersistedContent {
  const record = asRecord(content);
  const dir = record['dir'];
  const format = record['format'];

  return {
    dir: isDirection(dir) ? dir : dirForCode(code ?? 'translate_to_target'),
    langs: readLangs(record['langs']),
    format: format === 'single' || format === 'set' ? format : 'set',
    note: asString(record['note']),
    items: readItems(record['items']),
    check: readCheck(record['check']),
    flow: readFlow(record['flow']),
    ai: readAi(record['ai']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const items: Record<string, PersistedAnswerItem> = {};

  for (const [id, raw] of Object.entries(asRecord(asRecord(expectedAnswers)['items']))) {
    const record = asRecord(raw);
    const explanation = record['explanation'];
    const teacherNote = record['teacherNote'];
    items[id] = {
      refs: readStringArray(record['refs']),
      require: readGuards(record['require']),
      forbid: readGuards(record['forbid']),
      ...(typeof explanation === 'string' ? { explanation } : {}),
      ...(typeof teacherNote === 'string' ? { teacherNote } : {}),
    };
  }

  return { items };
}

/**
 * Read a submission: one text per item, keyed by item id.
 *
 * Accepts the wire shape (`{ answers: [{ itemId, text }] }`) and a bare array of the same,
 * because the attempt API and the self-check endpoint wrap it differently and neither
 * should have to know how the other does it.
 */
export function readSubmission(value: unknown): Record<string, string> {
  const raw = Array.isArray(value) ? value : asRecord(value)['answers'];
  const out: Record<string, string> = {};

  if (!Array.isArray(raw)) return out;

  for (const entry of raw) {
    const record = asRecord(entry);
    const itemId = record['itemId'];
    if (typeof itemId !== 'string' || itemId === '') continue;
    out[itemId] = asString(record['text']);
  }

  return out;
}

/** The inverse, for clients that hold answers as a map. Order follows the given items. */
export const toSubmission = (
  items: { id: string }[],
  answers: Record<string, string>,
): SubmittedItem[] => items.map((item) => ({ itemId: item.id, text: answers[item.id] ?? '' }));

export const isTranslateCode = (value: unknown): value is TranslateType =>
  typeof value === 'string' && (TRANSLATE_TYPES as readonly string[]).includes(value);

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
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

const isDirection = (value: unknown): value is Direction =>
  value === 'to_target' || value === 'from_target' || value === 'both';

const cleanGuards = (guards: Guard[]): Guard[] =>
  (guards ?? [])
    .filter((guard) => guard.text.trim() !== '')
    .map((guard) => ({
      text: guard.text,
      ...(guard.note === undefined || guard.note === '' ? {} : { note: guard.note }),
    }));

function readLangs(value: unknown): Langs {
  const record = asRecord(value);
  return {
    explain: asString(record['explain'], DEFAULT_LANGS.explain),
    target: asString(record['target'], DEFAULT_LANGS.target),
  };
}

function readItems(value: unknown): PersistedItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    const record = asRecord(raw);
    const hint = record['hint'];
    const mediaId = record['mediaId'];
    return {
      id: asString(record['id']),
      dir: record['dir'] === 'from_target' ? 'from_target' : 'to_target',
      source: asString(record['source']),
      ...(typeof hint === 'string' ? { hint } : {}),
      gloss: readGloss(record['gloss']),
      ...(typeof mediaId === 'string' ? { mediaId } : {}),
    };
  });
}

function readGloss(value: unknown): Gloss[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    const record = asRecord(raw);
    return { w: asString(record['w']), t: asString(record['t']) };
  });
}

/**
 * Guards were plain strings in the handoff and became `{ text, note }` here, so that a
 * fired guard can explain itself (plan 42, "Разбор ошибки"). A stored string still reads.
 */
function readGuards(value: unknown): Guard[] {
  if (!Array.isArray(value)) return [];

  const out: Guard[] = [];
  for (const raw of value) {
    if (typeof raw === 'string') {
      if (raw.trim() !== '') out.push({ text: raw });
      continue;
    }
    const record = asRecord(raw);
    const text = asString(record['text']);
    const note = record['note'];
    if (text.trim() === '') continue;
    out.push({ text, ...(typeof note === 'string' && note !== '' ? { note } : {}) });
  }

  return out;
}

function readCheck(value: unknown): Check {
  const record = asRecord(value);
  // 0.5–0.95 by the handoff's slider; a stored 0 would call every answer "near".
  const near = Math.max(0.5, Math.min(0.95, asNumber(record['near'], DEFAULT_CHECK.near)));

  return {
    on: asBoolean(record['on'], DEFAULT_CHECK.on),
    caseInsensitive: asBoolean(record['caseInsensitive'], DEFAULT_CHECK.caseInsensitive),
    ignorePunct: asBoolean(record['ignorePunct'], DEFAULT_CHECK.ignorePunct),
    foldDiacritics: asBoolean(record['foldDiacritics'], DEFAULT_CHECK.foldDiacritics),
    typo: asBoolean(record['typo'], DEFAULT_CHECK.typo),
    near,
    exactPass: asBoolean(record['exactPass'], DEFAULT_CHECK.exactPass),
  };
}

function readFlow(value: unknown): Flow {
  const record = asRecord(value);
  const attempts = record['attempts'];
  const showRefs = record['showRefs'];
  const replayLimit = record['replayLimit'];
  // 0–5 by the handoff; a stored 50 would hand out unlimited self-checks.
  const selfCheck = Math.max(
    0,
    Math.min(5, Math.trunc(asNumber(record['selfCheck'], DEFAULT_FLOW.selfCheck))),
  );

  return {
    selfCheck,
    attempts: attempts === 'once' || attempts === 'free' ? attempts : DEFAULT_FLOW.attempts,
    showRefs:
      showRefs === 'afterGraded' || showRefs === 'afterSubmit' || showRefs === 'never'
        ? showRefs
        : DEFAULT_FLOW.showRefs,
    keyboard: asBoolean(record['keyboard'], DEFAULT_FLOW.keyboard),
    gloss: asBoolean(record['gloss'], DEFAULT_FLOW.gloss),
    charCount: asBoolean(record['charCount'], DEFAULT_FLOW.charCount),
    replayLimit:
      typeof replayLimit === 'number' && Number.isFinite(replayLimit) && replayLimit > 0
        ? Math.trunc(replayLimit)
        : null,
  };
}

function readAi(value: unknown): Ai {
  const record = asRecord(value);
  const checks = asRecord(record['checks']);
  const visibility = record['visibility'];

  return {
    on: asBoolean(record['on'], DEFAULT_AI.on),
    checks: {
      grammar: asBoolean(checks['grammar'], DEFAULT_AI.checks.grammar),
      order: asBoolean(checks['order'], DEFAULT_AI.checks.order),
      lexis: asBoolean(checks['lexis'], DEFAULT_AI.checks.lexis),
      register: asBoolean(checks['register'], DEFAULT_AI.checks.register),
    },
    visibility:
      visibility === 'teacher' || visibility === 'studentBefore' || visibility === 'studentAfter'
        ? visibility
        : DEFAULT_AI.visibility,
  };
}
