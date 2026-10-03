// How a `sort_into_buckets` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns:
//
//   content          → title, instruction, settings, the buckets with their rules, the
//                       refusal bucket, and per item: its id, its text and its recording
//   expected_answers → per item: the primary bucket, the buckets also accepted, why it
//                       belongs there, and the feedback for each wrong bucket
//
// SPEC_data_model §Expected answers. The prototype keeps `bucketId`, `also` and `why` on the
// item and `fb` beside it for editing convenience; the authored model here does the same,
// and this file is the one place that knows where each half is stored.
//
// Bucket rules stay in `content`: they are not the key. A rule says what `en` means, not
// which word is `en`, and the projection decides how much of it the student sees.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown` and must not
// throw. It coerces and fills defaults, leaving issues.ts to report what is missing.

import type {
  Attempts,
  Bucket,
  ItemFeedback,
  Settings,
  SortIntoBucketsContent,
  SortItem,
} from './model.js';
import { ATTEMPTS, DEFAULT_SETTINGS } from './model.js';

export const TEMPLATE_CODE = 'sort_into_buckets';

/** One item as the `content` column holds it — never its bucket. */
export interface PersistedItem {
  id: string;
  text: string;
  mediaId?: string;
  audio?: unknown;
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  buckets: Bucket[];
  useNone: boolean;
  noneLabel: string;
  items: PersistedItem[];
  settings: Settings;
}

/** One item's key. */
export interface PersistedKey {
  bucketId: string | null;
  also: string[];
  why: string;
  fb: ItemFeedback;
}

/** The `expected_answers` column. Keyed by item id, so reordering cannot shuffle it. */
export interface PersistedAnswers {
  items: Record<string, PersistedKey>;
}

export function toContent(ex: SortIntoBucketsContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    buckets: ex.buckets.map((b) => ({ id: b.id, label: b.label, rule: b.rule })),
    useNone: ex.useNone,
    noneLabel: ex.noneLabel,
    // Unfinished items are persisted as written — the teacher must be able to leave and
    // come back mid-list. The projection drops them.
    items: ex.items.map((i) => ({
      id: i.id,
      text: i.text,
      ...(i.mediaId !== undefined ? { mediaId: i.mediaId } : {}),
      ...(i.audio !== undefined ? { audio: i.audio } : {}),
    })),
    settings: { ...ex.settings },
  };
}

export function toExpectedAnswers(ex: SortIntoBucketsContent): PersistedAnswers {
  const items: PersistedAnswers['items'] = {};
  for (const i of ex.items) {
    const fb = ex.fb[i.id];
    items[i.id] = {
      bucketId: i.bucketId,
      also: [...i.also],
      why: i.why,
      fb: { def: fb?.def ?? '', ov: { ...(fb?.ov ?? {}) } },
    };
  }
  return { items };
}

export function fromPersisted(content: unknown, expectedAnswers: unknown): SortIntoBucketsContent {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);

  const fb: SortIntoBucketsContent['fb'] = {};
  const items = persisted.items.map((i): SortItem => {
    const key = answers.items[i.id];
    if (key) fb[i.id] = key.fb;
    return {
      id: i.id,
      text: i.text,
      bucketId: key?.bucketId ?? null,
      also: key?.also ?? [],
      why: key?.why ?? '',
      ...(i.mediaId !== undefined ? { mediaId: i.mediaId } : {}),
      ...(i.audio !== undefined ? { audio: i.audio } : {}),
    };
  });

  return {
    title: persisted.title,
    instruction: persisted.instruction,
    buckets: persisted.buckets,
    useNone: persisted.useNone,
    noneLabel: persisted.noneLabel,
    items,
    fb,
    settings: persisted.settings,
  };
}

/** Read the `content` column on its own — all the runner ever gets to see. */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  return {
    title: asString(record['title']),
    instruction: asString(record['instruction']),
    buckets: readBuckets(record['buckets']),
    useNone: record['useNone'] === true,
    noneLabel: asString(record['noneLabel']),
    items: readItems(record['items']),
    settings: readSettings(record['settings']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const items: PersistedAnswers['items'] = {};
  for (const [id, raw] of Object.entries(asRecord(asRecord(expectedAnswers)['items']))) {
    const record = asRecord(raw);
    const bucketId = record['bucketId'];
    const fb = asRecord(record['fb']);
    const ov: Record<string, string> = {};
    for (const [bucket, text] of Object.entries(asRecord(fb['ov']))) {
      if (typeof text === 'string') ov[bucket] = text;
    }
    items[id] = {
      bucketId: typeof bucketId === 'string' && bucketId !== '' ? bucketId : null,
      also: Array.isArray(record['also'])
        ? (record['also'] as unknown[]).filter((b): b is string => typeof b === 'string' && b !== '')
        : [],
      why: asString(record['why']),
      fb: { def: asString(fb['def']), ov },
    };
  }
  return { items };
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

function readBuckets(value: unknown): Bucket[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return {
      id: asString(record['id']),
      label: asString(record['label']),
      rule: asString(record['rule']),
    };
  });
}

function readItems(value: unknown): PersistedItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    const mediaId = record['mediaId'];
    const audio = record['audio'];
    return {
      id: asString(record['id']),
      text: asString(record['text']),
      ...(typeof mediaId === 'string' && mediaId !== '' ? { mediaId } : {}),
      ...(audio !== undefined && audio !== null ? { audio } : {}),
    };
  });
}

const isAttempts = (value: unknown): value is Attempts =>
  (ATTEMPTS as readonly unknown[]).includes(value);

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const attempts = record['attempts'];
  const threshold = record['threshold'];
  return {
    shuffle: asBoolean(record['shuffle'], DEFAULT_SETTINGS.shuffle),
    showRemaining: asBoolean(record['showRemaining'], DEFAULT_SETTINGS.showRemaining),
    hints: asBoolean(record['hints'], DEFAULT_SETTINGS.hints),
    revealKey: asBoolean(record['revealKey'], DEFAULT_SETTINGS.revealKey),
    attempts: isAttempts(attempts) ? attempts : DEFAULT_SETTINGS.attempts,
    // Clamped rather than defaulted: a threshold outside 0-100 is a bad number, not a
    // missing one, and silently restoring 70 would hide it from the author.
    threshold:
      typeof threshold === 'number' && Number.isFinite(threshold)
        ? Math.min(100, Math.max(0, Math.round(threshold)))
        : DEFAULT_SETTINGS.threshold,
  };
}
