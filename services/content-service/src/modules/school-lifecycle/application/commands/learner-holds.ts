import {
  leafIdsOf,
  materialKey,
  type MaterialHold,
  type SchoolMaterial,
  type SchoolMaterialsGraph,
  type StudiedKind,
} from '../../domain/school-materials.js';
import type {
  ActiveLearnersQuestion,
  IActiveLearnersReader,
} from '../ports/active-learners.reader.port.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const STUDIED: ReadonlySet<string> = new Set<StudiedKind>([
  'container',
  'lesson',
  'vocabulary_list',
  'grammar_rule',
  'exercise',
]);

/**
 * Asks learning which of `materials` still have an active learner (a container with the studied
 * materials inside it). Throws when learning cannot answer — the caller deletes nothing then.
 */
export async function learnerHoldsOn(
  materials: readonly SchoolMaterial[],
  graph: SchoolMaterialsGraph,
  learners: IActiveLearnersReader,
  now: Date,
  activeDays: number,
): Promise<MaterialHold[]> {
  const questions: ActiveLearnersQuestion[] = materials
    .filter((m) => STUDIED.has(m.kind))
    .map((m) => ({
      kind: m.kind as StudiedKind,
      id: m.id,
      leafIds: m.kind === 'container' ? leafIdsOf(m.id, graph) : [],
    }));
  if (questions.length === 0) return [];
  const active = await learners.countActive(
    questions,
    new Date(now.getTime() - activeDays * DAY_MS),
  );
  return questions
    .filter((q) => (active.get(materialKey({ kind: q.kind, id: q.id })) ?? 0) > 0)
    .map((q) => ({ to: { kind: q.kind, id: q.id }, reason: 'active_learner' }));
}

export function countByReason(holds: readonly MaterialHold[]): string {
  const counts = new Map<string, number>();
  for (const h of holds) counts.set(h.reason, (counts.get(h.reason) ?? 0) + 1);
  return [...counts].map(([r, n]) => `${r}=${n}`).join(', ') || 'none';
}
