/**
 * A row's `target` is the course title the consumer knew when it wrote the row. When it did
 * not know one it stored the course id instead (`target === targetId`) — before the
 * directory backfill reached every course, that put a raw UUID into the school's feed.
 */
export function unresolvedTargetIds(
  rows: ReadonlyArray<{ target: string | null; targetId: string | null }>,
): string[] {
  const ids = new Set<string>();
  for (const r of rows) if (r.target !== null && r.target === r.targetId) ids.add(r.target);
  return [...ids];
}

/** The title to show: a stored one as is, an id replaced by today's title or by nothing. */
export function shownTarget(
  row: { target: string | null; targetId: string | null },
  titles: ReadonlyMap<string, string>,
): string | null {
  if (row.target === null) return null;
  if (row.target !== row.targetId) return row.target;
  return titles.get(row.target) ?? null;
}

/** Actors whose name was not known when their row was written. */
export function unnamedActorIds(
  rows: ReadonlyArray<{ actorName: string | null; actorId: string | null }>,
): string[] {
  const ids = new Set<string>();
  for (const r of rows) if (r.actorName === null && r.actorId !== null) ids.add(r.actorId);
  return [...ids];
}
