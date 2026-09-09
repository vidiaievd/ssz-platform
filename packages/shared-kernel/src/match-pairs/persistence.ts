// How a `match_pairs` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns and its own fields:
//
//   content          → variant, settings, pairs (both halves), distractors
//   expected_answers → feedback (default, why, overrides)
//   the row + its instruction row → id, module, title, instructions, updatedAt
//
// The pairing itself lives in `content`, inside the pair that owns it, and is *not*
// repeated in `expected_answers`. That is the spec's rule — "the answer is never stored
// twice" — and it is why the content column has to go through `projection.ts` before it
// reaches a student: unlike eleven of the platform's templates, this one's content is
// the answer key.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown`, may
// predate the current shape, and must not throw. It coerces and fills defaults instead,
// leaving the validation engine to report what is actually missing.

import type {
  Distractor,
  MatchPairs,
  MatchTask,
  Override,
  Pair,
  PairFeedback,
  PairId,
  RightId,
  Settings,
  Variant,
} from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

export const TEMPLATE_CODE = 'match_pairs';

/** The `content` column: the task, answers included (they are the pairing). */
export type PersistedContent = MatchTask;

/** The `expected_answers` column: everything the student must not see before checking. */
export interface PersistedAnswers {
  feedback: Record<PairId, PairFeedback>;
}

/** The parts of the document the exercise row owns rather than its JSON columns. */
export interface DocumentEnvelope {
  id: string;
  moduleId: string;
  title: string;
  instructions: string;
  updatedAt: string;
}

export function toContent(ex: MatchPairs): PersistedContent {
  return {
    variant: ex.variant,
    settings: ex.settings,
    pairs: ex.pairs,
    distractors: ex.distractors,
  };
}

export function toExpectedAnswers(ex: MatchPairs): PersistedAnswers {
  return { feedback: ex.feedback };
}

export function fromPersisted(
  envelope: DocumentEnvelope,
  content: unknown,
  expectedAnswers: unknown,
): MatchPairs {
  return {
    ...envelope,
    type: TEMPLATE_CODE,
    ...readContent(content, expectedAnswers),
    feedback: readFeedback(asRecord(expectedAnswers)['feedback']),
  };
}

/**
 * Read the `content` column. The student projection needs exactly this and nothing else,
 * and it must not have to invent a title to get at it.
 *
 * `expectedAnswers` is optional and is read for one purpose only: a document still in the
 * pre-plan-49 shape kept its pairing in that column, and without it the two halves cannot
 * be matched up. A caller holding only the content column may omit it — see
 * `readLegacyPairs` for what is lost.
 */
export function readContent(content: unknown, expectedAnswers?: unknown): PersistedContent {
  const record = asRecord(content);
  const legacy = readLegacyPairs(record, expectedAnswers);

  return {
    variant: record['variant'] === 'halves' ? 'halves' : ('pairs' satisfies Variant),
    settings: readSettings(record['settings']),
    pairs: legacy ?? readPairs(record['pairs']),
    distractors: readDistractors(record['distractors']),
  };
}

// ── The shape this type had before plan 49 ──────────────────────────────────

/**
 * The pre-plan-49 content: two parallel lists of `{ id, text }`, with the pairing held
 * apart in `expected_answers.pairs` as `{ left_id, right_id }`.
 *
 * Read here rather than in a migration script alone, because a migration converts the
 * rows it knows about and this converts everything else: a draft saved by a browser tab
 * left open across the deploy, a fixture in someone's test, a course restored from an
 * older version. The seventeen seeded exercises are still rewritten properly (plan phase
 * 2) — this is the floor under that, not a substitute for it.
 *
 * **The pairing must come from `expected_answers`, never from the position in the two
 * lists.** Twelve of the seventeen seeded exercises happen to line up — `l1→r1`, `l2→r2`
 * — and the five in Ny i Norge A2 do not: `g17-match-subjunksjon` maps `l1→r2`, `l2→r4`,
 * `l3→r1`, `l4→r3`, because the right column was deliberately written out of order so
 * that the answers were not the identity mapping. Pairing by position would have silently
 * given every one of those exercises the wrong answer key.
 *
 * Position is kept only as the floor under a caller that has the content column and
 * nothing else. It is a guess, and it is the reason `readContent` takes the answers.
 */
function readLegacyPairs(content: Record<string, unknown>, expectedAnswers?: unknown): Pair[] | null {
  if (Array.isArray(content['pairs'])) return null;
  const left = content['left_items'];
  const right = content['right_items'];
  if (!Array.isArray(left) || !Array.isArray(right)) return null;

  const textByRightId = new Map<string, string>();
  right.forEach((raw, index) => {
    const record = asRecord(raw);
    textByRightId.set(asString(record['id'], `r${index}`), asString(record['text']));
  });

  const rightIdByLeftId = new Map<string, string>();
  const mapping = asRecord(expectedAnswers)['pairs'];
  if (Array.isArray(mapping)) {
    for (const raw of mapping) {
      const record = asRecord(raw);
      const leftId = record['left_id'];
      const rightId = record['right_id'];
      if (typeof leftId === 'string' && typeof rightId === 'string') {
        rightIdByLeftId.set(leftId, rightId);
      }
    }
  }

  return left.map((raw, index) => {
    const leftRecord = asRecord(raw);
    const id = asString(leftRecord['id'], `l${index}`);
    const mapped = rightIdByLeftId.get(id);
    const text =
      mapped === undefined
        ? asString(asRecord(right[index])['text'])
        : (textByRightId.get(mapped) ?? '');

    return {
      id,
      // Minted, not copied: the legacy right id (`r1`) is stable per document but says
      // "answer number one" out loud, and this id is shipped to the student.
      rightId: `q${id}`,
      left: asString(leftRecord['text']),
      right: text,
    };
  });
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

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  return {
    distractors: asBoolean(record['distractors'], DEFAULT_SETTINGS.distractors),
    shuffle: asBoolean(record['shuffle'], DEFAULT_SETTINGS.shuffle),
    showRemaining: asBoolean(record['showRemaining'], DEFAULT_SETTINGS.showRemaining),
  };
}

function readPairs(value: unknown): Pair[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw, index) => {
    const record = asRecord(raw);
    const id = asString(record['id'], `p${index}`);
    return {
      id,
      rightId: asString(record['rightId'], `q${id}`),
      left: asString(record['left']),
      right: asString(record['right']),
    };
  });
}

function readDistractors(value: unknown): Distractor[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw, index) => {
    const record = asRecord(raw);
    return {
      id: asString(record['id'], `d${index}`),
      text: asString(record['text']),
    };
  });
}

function readFeedback(value: unknown): Record<PairId, PairFeedback> {
  const out: Record<PairId, PairFeedback> = {};

  for (const [pairId, raw] of Object.entries(asRecord(value))) {
    const record = asRecord(raw);
    out[pairId] = {
      def: asString(record['def']),
      why: asString(record['why']),
      ov: readOverrides(record['ov']),
    };
  }

  return out;
}

function readOverrides(value: unknown): Record<RightId, Override> {
  const out: Record<RightId, Override> = {};

  for (const [rightId, raw] of Object.entries(asRecord(value))) {
    const record = asRecord(raw);
    // An entry with no recorded origin predates the field, which means a human wrote it:
    // AI drafting did not exist yet. Defaulting to 'ai_draft' would hide teachers' own
    // explanations from their students.
    out[rightId] = {
      text: asString(record['text']),
      origin: record['origin'] === 'ai_draft' ? 'ai_draft' : 'author',
    };
  }

  return out;
}
