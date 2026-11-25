/** Referenced course ids that have no directory row yet (nulls dropped, each id once). */
export function missingDirectoryIds(
  referenced: ReadonlyArray<string | null>,
  known: ReadonlyArray<string>,
): Set<string> {
  const have = new Set(known);
  const ids = new Set<string>();
  for (const id of referenced) if (id !== null && !have.has(id)) ids.add(id);
  return ids;
}
