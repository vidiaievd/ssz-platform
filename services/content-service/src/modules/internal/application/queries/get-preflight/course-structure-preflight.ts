export interface CourseStructureViolation {
  ruleCode: 'ITEM_OUTSIDE_MODULE';
  severity: 'blocker';
  itemType: string;
  itemId: string;
  detail: string;
}

/**
 * A course is built from modules; material sits inside a module (OQ-6, owner's decision
 * 22.11). A lesson, list, rule or exercise placed on the course itself is invisible to
 * learners: the phone's course home and its offline download walk modules only, so such a
 * course opens empty there (the demo course «Stein på stein» did). The editor offers no way
 * to put material there — only seeds and the raw API can — so this rule is the guard at
 * publish.
 *
 * Only a `COURSE` version is checked: a module holds material directly, a collection is a
 * loose set by definition.
 */
export function courseStructureViolations(
  containerType: string,
  items: ReadonlyArray<{ itemType: string; itemId: string }>,
): CourseStructureViolation[] {
  if (containerType !== 'COURSE') return [];
  return items
    .filter((item) => item.itemType !== 'CONTAINER')
    .map((item) => ({
      ruleCode: 'ITEM_OUTSIDE_MODULE' as const,
      severity: 'blocker' as const,
      itemType: item.itemType,
      itemId: item.itemId,
      detail: 'Material is placed on the course outside any module',
    }));
}
