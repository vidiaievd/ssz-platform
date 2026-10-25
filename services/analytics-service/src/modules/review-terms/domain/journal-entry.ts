import { EXERCISE_ENGINE_EVENT_TYPES } from '@ssz/contracts';

const AI_REVIEWED = EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_AI_REVIEWED;
const REVIEWED = EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_REVIEWED;

type Outcome = 'approved' | 'returned';

/** A model's verdict counted at the school's term: the journal's row. */
export interface AcceptedEntry {
  kind: 'accepted';
  attemptId: string;
  schoolId: string;
  groupId: string | null;
  containerId: string | null;
  userId: string;
  exerciseId: string;
  templateCode: string;
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  aiOutcome: Outcome;
  acceptedAt: Date;
}

/** A teacher's verdict on work that had counted at the term (plan 80, 4b). */
export interface RevisedEntry {
  kind: 'revised';
  attemptId: string;
  schoolId: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  revisedBy: string;
  revisedOutcome: Outcome;
  revisedAt: Date;
}

export type JournalEntry = AcceptedEntry | RevisedEntry;

/**
 * What an event writes into the auto-acceptance journal (plan 80, step 6a).
 *
 * `'skip'` — an event this journal has nothing to do with: a model's verdict that closed the
 * work at once, a teacher's verdict that was not a revision. `null` — one it should read and
 * cannot. Dispatched on the routing key, never on the envelope's type (memory
 * `auth-envelope-event-type-is-csharp-name`).
 */
export function journalEntryOf(routingKey: string, payload: unknown): JournalEntry | 'skip' | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;

  if (routingKey === AI_REVIEWED) {
    if (p.acceptedAtTerm !== true) return 'skip';
    // A term is only ever a school's, so a row without one is a broken letter.
    if (
      !isId(p.attemptId) ||
      !isId(p.schoolId) ||
      !nullableId(p.groupId) ||
      !nullableId(p.containerId) ||
      !isId(p.userId) ||
      !isId(p.exerciseId) ||
      !isId(p.templateCode) ||
      !isId(p.capability) ||
      !nullableId(p.modelId) ||
      !nullableId(p.promptVersion) ||
      !isOutcome(p.outcome) ||
      !isInstant(p.occurredAt)
    ) {
      return null;
    }
    return {
      kind: 'accepted',
      attemptId: p.attemptId,
      schoolId: p.schoolId,
      groupId: p.groupId ?? null,
      containerId: p.containerId ?? null,
      userId: p.userId,
      exerciseId: p.exerciseId,
      templateCode: p.templateCode,
      capability: p.capability,
      modelId: p.modelId ?? null,
      promptVersion: p.promptVersion ?? null,
      aiOutcome: p.outcome,
      acceptedAt: new Date(p.occurredAt),
    };
  }

  if (routingKey === REVIEWED) {
    if (p.revisesVerdict !== true) return 'skip';
    if (
      !isId(p.attemptId) ||
      !isId(p.schoolId) ||
      !isId(p.userId) ||
      !isId(p.exerciseId) ||
      !isId(p.templateCode) ||
      !isId(p.reviewerId) ||
      !isOutcome(p.outcome) ||
      !isInstant(p.occurredAt)
    ) {
      return null;
    }
    return {
      kind: 'revised',
      attemptId: p.attemptId,
      schoolId: p.schoolId,
      userId: p.userId,
      exerciseId: p.exerciseId,
      templateCode: p.templateCode,
      revisedBy: p.reviewerId,
      revisedOutcome: p.outcome,
      revisedAt: new Date(p.occurredAt),
    };
  }

  return null;
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function nullableId(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isId(value);
}

function isOutcome(value: unknown): value is Outcome {
  return value === 'approved' || value === 'returned';
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
