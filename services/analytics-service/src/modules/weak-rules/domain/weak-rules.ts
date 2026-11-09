import type { ExerciseFeedbackAtomsFlaggedPayload, FlaggedAtomsSource } from '@ssz/contracts';

export const GRAMMAR_RULE_ATOM = 'grammar_rule_atom';
/** The atom types a flag is kept for: rules (plan 85) and sound families (plan 86, step 8.4). */
const KEPT_ATOM_TYPES: ReadonlySet<string> = new Set([GRAMMAR_RULE_ATOM, 'sound']);
const SOURCES: readonly FlaggedAtomsSource[] = ['ai_precheck', 'ai_review', 'teacher', 'ai_voice', 'ai_session'];
const MAX_ATOMS = 100;

export interface FlagRow {
  day: string;
  userId: string;
  exerciseId: string;
  atomType: string;
  atomId: string;
  source: FlaggedAtomsSource;
  schoolId: string | null;
  groupId: string | null;
  containerId: string | null;
  inExerciseTargets: boolean;
  flaggedAt: Date;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const orNull = (v: unknown): string | null => (isString(v) ? v : null);

/**
 * The rows one `atoms_flagged` event folds into, or null when the event is malformed.
 *
 * Grammar rule atoms and `sound` families are kept (plan 86 §4y.1, Q20): the sounds have no
 * screen yet, but a fact not written today cannot be rebuilt for the one session 7 brings, and
 * the weak-rules reader asks for `grammar_rule_atom` only. Words are dropped. The day is the
 * signal's own (`occurredAt`, UTC), so a message that waited in the queue is still counted on
 * the day it was made.
 */
export function flagRowsOf(p: Partial<ExerciseFeedbackAtomsFlaggedPayload> | undefined): FlagRow[] | null {
  if (!p) return null;
  if (!isString(p.userId) || !isString(p.exerciseId)) return null;
  if (!SOURCES.includes(p.source as FlaggedAtomsSource)) return null;
  if (!isString(p.occurredAt) || Number.isNaN(Date.parse(p.occurredAt))) return null;
  if (!Array.isArray(p.atoms)) return null;

  const flaggedAt = new Date(p.occurredAt);
  const rows = new Map<string, FlagRow>();
  for (const atom of p.atoms.slice(0, MAX_ATOMS)) {
    if (!atom || !KEPT_ATOM_TYPES.has(atom.atomType) || !isString(atom.atomId)) continue;
    rows.set(`${atom.atomType}:${atom.atomId}`, {
      day: flaggedAt.toISOString().slice(0, 10),
      userId: p.userId,
      exerciseId: p.exerciseId,
      atomType: atom.atomType,
      atomId: atom.atomId,
      source: p.source as FlaggedAtomsSource,
      schoolId: orNull(p.schoolId),
      groupId: orNull(p.groupId),
      containerId: orNull(p.containerId),
      inExerciseTargets: atom.inExerciseTargets === true,
      flaggedAt,
    });
  }
  return [...rows.values()];
}

export type WeakRulesWindow = '7' | '30' | 'course';

export function parseWindow(raw: string | undefined): WeakRulesWindow {
  return raw === '7' || raw === 'course' ? raw : '30';
}

/** First UTC day (inclusive) of a window ending today; null for the whole course. */
export function windowSince(window: WeakRulesWindow, now: Date): string | null {
  if (window === 'course') return null;
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  since.setUTCDate(since.getUTCDate() - (Number(window) - 1));
  return since.toISOString().slice(0, 10);
}

export interface FlagFact {
  userId: string;
  atomId: string;
  exerciseId: string;
  source: FlaggedAtomsSource;
  flaggedAt: Date;
}

export interface WeakRule {
  atomId: string;
  /** Signals counted: one per (learner, exercise, source) — the day dedup is already in the rows. */
  flags: number;
  learners: number;
  bySource: Record<FlaggedAtomsSource, number>;
  lastFlaggedAt: string;
}

/** Most-flagged first; ties by more learners, then by atom id so the order is stable. */
export function aggregateWeakRules(facts: readonly FlagFact[]): WeakRule[] {
  const byAtom = new Map<string, { facts: FlagFact[]; users: Set<string> }>();
  for (const fact of facts) {
    const entry = byAtom.get(fact.atomId) ?? { facts: [], users: new Set<string>() };
    entry.facts.push(fact);
    entry.users.add(fact.userId);
    byAtom.set(fact.atomId, entry);
  }

  return [...byAtom.entries()]
    .map(([atomId, { facts: list, users }]) => {
      const bySource: Record<FlaggedAtomsSource, number> = { ai_precheck: 0, ai_review: 0, teacher: 0, ai_voice: 0, ai_session: 0 };
      let last = list[0].flaggedAt;
      for (const f of list) {
        bySource[f.source] += 1;
        if (f.flaggedAt > last) last = f.flaggedAt;
      }
      return { atomId, flags: list.length, learners: users.size, bySource, lastFlaggedAt: last.toISOString() };
    })
    .sort((a, b) => b.flags - a.flags || b.learners - a.learners || a.atomId.localeCompare(b.atomId));
}
