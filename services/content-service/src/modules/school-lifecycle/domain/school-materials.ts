/**
 * What a purged school leaves behind in content (plan 90, phase 5, step 4b, Q5), and what a
 * cleanup of obsolete courses deletes (step 4c) — the same rule over a smaller set.
 *
 * Everything the school owns (`owner_school_id`) is deleted unless somebody else still uses it.
 * "Uses" is a hold, and a hold spreads to everything the held material needs to work:
 *
 * - **roots** — an active learner (learning-service's count), a live share, and any row outside the
 *   school that points into it: a foreign course's item, a foreign lesson's listening stage / video
 *   question / glossary mark / text span, a foreign rule's exercise pool entry, a foreign exercise's
 *   target, a learner's own word ("Мои слова") on the school's vocabulary item, a foreign material
 *   tagged with the school's tag or linked to its can-do descriptor. Deleting the target would change
 *   or cascade away a row that is not the school's.
 * - **edges** — inside the school: a container to the items of each of its versions, a lesson to
 *   the exercises, vocabulary lists and rules its variants name, an exercise to the vocabulary
 *   lists and rules its targets name, a rule to the exercises of its pool, any material to the
 *   school's tags on it and the school's can-do descriptors it is linked to.
 *
 * Pure; the store gathers the graph, the application asks learning for the learner roots.
 */

export const MATERIAL_KINDS = [
  'container',
  'lesson',
  'vocabulary_list',
  'grammar_rule',
  'exercise',
  'tag',
  'can_do',
] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** The kinds learners study and learning-service can be asked about. */
export type StudiedKind = Exclude<MaterialKind, 'tag' | 'can_do'>;

export interface MaterialRef {
  kind: MaterialKind;
  id: string;
}

export interface SchoolMaterial extends MaterialRef {
  /** Containers only: `course` / `module` / `collection`. */
  containerType?: string;
}

/** `from` needs `to`; `to` may be outside the school (then it only matters for leaves). */
export interface MaterialEdge {
  from: MaterialRef;
  to: MaterialRef;
}

export type HoldReason =
  | 'active_learner'
  | 'share'
  | 'foreign_reference'
  | 'personal_word'
  // Another material of the same owner, outside what a cleanup deletes, needs it (step 4c).
  | 'owner_reference';

/**
 * Whose materials a graph covers: a school (`owner_school_id`), or an author on their own
 * (`owner_school_id IS NULL`, `owner_user_id`). Tags and can-do descriptors belong to schools only.
 */
export type MaterialOwner = { kind: 'school'; schoolId: string } | { kind: 'user'; userId: string };

export function ownerOf(row: { ownerSchoolId: string | null; ownerUserId: string }): MaterialOwner {
  return row.ownerSchoolId
    ? { kind: 'school', schoolId: row.ownerSchoolId }
    : { kind: 'user', userId: row.ownerUserId };
}

export function ownerKey(owner: MaterialOwner): string {
  return owner.kind === 'school' ? `school:${owner.schoolId}` : `user:${owner.userId}`;
}

export interface MaterialHold {
  to: MaterialRef;
  reason: HoldReason;
}

export interface SchoolMaterialsGraph {
  materials: SchoolMaterial[];
  edges: MaterialEdge[];
  /** Shares, foreign references and learners' own words — everything but active learners. */
  holds: MaterialHold[];
}

export interface PurgePlan {
  /** Kept because somebody still uses it (directly or through what it belongs to). */
  kept: SchoolMaterial[];
  /** Kept courses — they become `obsolete`. */
  keptCourseIds: string[];
  deleted: SchoolMaterial[];
}

export function materialKey(ref: MaterialRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** Splits the school's materials into what stays and what goes. */
export function planSchoolPurge(
  graph: SchoolMaterialsGraph,
  learnerHolds: readonly MaterialHold[],
): PurgePlan {
  const own = new Map(graph.materials.map((m) => [materialKey(m), m]));
  const next = ownEdges(graph, own);

  const held = new Set<string>();
  const queue = [...graph.holds, ...learnerHolds]
    .map((h) => materialKey(h.to))
    .filter((k) => own.has(k));
  while (queue.length > 0) {
    const key = queue.pop()!;
    if (held.has(key)) continue;
    held.add(key);
    for (const to of next.get(key) ?? []) if (!held.has(to)) queue.push(to);
  }

  const kept: SchoolMaterial[] = [];
  const deleted: SchoolMaterial[] = [];
  for (const [key, material] of own) (held.has(key) ? kept : deleted).push(material);
  const keptCourseIds = kept
    .filter((m) => m.kind === 'container' && m.containerType === 'course')
    .map((m) => m.id);
  return { kept, keptCourseIds, deleted };
}

/**
 * What a cleanup of obsolete courses may delete (plan 90, phase 5, step 4c): the courses and
 * everything of the owner that only they reach. `graph` covers the whole owner, so the owner's
 * other materials are there to hold what they still need.
 */
export function cleanupCandidates(
  graph: SchoolMaterialsGraph,
  courseIds: readonly string[],
): SchoolMaterial[] {
  const own = new Map(graph.materials.map((m) => [materialKey(m), m]));
  const next = ownEdges(graph, own);
  const inside = new Set<string>();
  const queue = courseIds
    .map((id) => materialKey({ kind: 'container', id }))
    .filter((k) => own.has(k));
  while (queue.length > 0) {
    const key = queue.pop()!;
    if (inside.has(key)) continue;
    inside.add(key);
    for (const to of next.get(key) ?? []) if (!inside.has(to)) queue.push(to);
  }
  return [...inside].map((k) => own.get(k)!);
}

/**
 * Splits obsolete courses and their contents into what stays and what goes. The same rule as a
 * school's purge, over the candidates only: any material of the owner outside them that points
 * in holds the target, as a foreign row would. A held course stays `obsolete` and is asked
 * about again on the next run.
 */
export function planObsoleteCleanup(
  graph: SchoolMaterialsGraph,
  courseIds: readonly string[],
  learnerHolds: readonly MaterialHold[],
): PurgePlan {
  const candidates = cleanupCandidates(graph, courseIds);
  const inside = new Set(candidates.map(materialKey));
  const own = new Set(graph.materials.map(materialKey));
  const holds: MaterialHold[] = [...graph.holds];
  for (const edge of graph.edges) {
    const from = materialKey(edge.from);
    if (own.has(from) && !inside.has(from) && inside.has(materialKey(edge.to)))
      holds.push({ to: edge.to, reason: 'owner_reference' });
  }
  return planSchoolPurge({ materials: candidates, edges: graph.edges, holds }, learnerHolds);
}

function ownEdges(
  graph: SchoolMaterialsGraph,
  own: { has(key: string): boolean },
): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const from = materialKey(edge.from);
    const to = materialKey(edge.to);
    if (!own.has(from) || !own.has(to)) continue;
    const list = next.get(from);
    if (list) list.push(to);
    else next.set(from, [to]);
  }
  return next;
}

/**
 * The studied materials inside a container — what learning-service checks a learner's progress
 * against. Follows the school's own nested containers; a foreign item counts as a leaf too.
 */
export function leafIdsOf(containerId: string, graph: SchoolMaterialsGraph): string[] {
  const own = new Set(graph.materials.map(materialKey));
  const byContainer = new Map<string, MaterialRef[]>();
  for (const edge of graph.edges) {
    if (edge.from.kind !== 'container') continue;
    const list = byContainer.get(edge.from.id);
    if (list) list.push(edge.to);
    else byContainer.set(edge.from.id, [edge.to]);
  }

  const leaves = new Set<string>();
  const seen = new Set<string>([containerId]);
  const queue = [containerId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const item of byContainer.get(id) ?? []) {
      if (item.kind === 'container') {
        if (own.has(materialKey(item)) && !seen.has(item.id)) {
          seen.add(item.id);
          queue.push(item.id);
        }
      } else if (item.kind !== 'tag' && item.kind !== 'can_do') {
        leaves.add(item.id);
      }
    }
  }
  return [...leaves];
}
