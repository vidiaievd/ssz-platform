import { fromPersisted, issues, type Issue } from '@ssz/shared-kernel/sort-into-buckets';

export interface SortIntoBucketsPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `sort_into_buckets`, decided by the same engine the builder
 * runs (plan 66). One implementation, so an author cannot be told the board is ready and
 * then have publication refused.
 *
 * The blocker that earns this file fails silently: an item with no bucket is not marked
 * wrong, it is *dropped* — the projection asks the key column whether an item is ready,
 * and an unassigned one never reaches the student. The board publishes clean and shows
 * fewer items than the author wrote. `SB_NO_EXPLANATION` is the other quiet one: a wrong
 * placement with no default explanation comes back «wrong» with no reason, which is the
 * exact thing the type exists to avoid.
 *
 * And it is the reason this file exists beside the builder's gate: the rail deliberately
 * shows an untouched step as empty rather than red (plan 66 §4.2); publication runs over a
 * whole container and says no.
 */
export function sortIntoBucketsViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): SortIntoBucketsPreflightViolation[] {
  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per item or bucket: the builder puts each message where it
  // belongs; a version report doing the same would bury the container under one board.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `SORTINTOBUCKETS_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeSortIntoBucketsIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the secondary
 * line under the copy it does have.
 */
export function describeSortIntoBucketsIssue(issue: Issue, count: number): string {
  const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`;
  const buckets = (n: number) => `${n} bucket${n === 1 ? '' : 's'}`;
  const have = (n: number) => (n === 1 ? 'has' : 'have');

  switch (issue.code) {
    case 'SB_BUCKETS_TOO_FEW':
      return `Only ${buckets(issue.count)} ${issue.count === 1 ? 'is' : 'are'} labelled; sorting needs at least two`;
    case 'SB_BUCKET_UNLABELLED':
      return `${buckets(count)} ${have(count)} no label, so the student would see a blank zone`;
    case 'SB_BUCKET_LABEL_DUPLICATE':
      return 'Two buckets carry the same label, so the student cannot tell them apart';
    case 'SB_BUCKETS_TOO_MANY':
      return `The exercise has ${issue.count} buckets; five is the most that fit a phone screen`;
    case 'SB_ITEM_UNASSIGNED':
      return `${items(count)} ${have(count)} no bucket, so ${count === 1 ? 'it is' : 'they are'} dropped from what the student receives`;
    case 'SB_ITEMS_TOO_FEW':
      return `Only ${items(issue.count)} ${issue.count === 1 ? 'is' : 'are'} ready; four is the fewest that show whether the rule is known`;
    case 'SB_ITEM_DUPLICATE':
      return `${items(count)} ${count === 1 ? 'appears' : 'appear'} twice, so the tiles cannot be told apart`;
    case 'SB_BUCKET_EMPTY':
      return `${buckets(count)} ${have(count)} no items`;
    case 'SB_THIN_BUCKETS':
      return `${buckets(count)} ${have(count)} only one item, which reads as a guessing game`;
    case 'SB_SKEWED':
      return `${Math.round(issue.share * 100)}% of the items are in one bucket, so dumping everything there scores well`;
    case 'SB_MULTI_HEAVY':
      return `${issue.count} of ${issue.total} items accept more than one bucket, so almost nothing can be wrong`;
    case 'SB_ITEM_LONG':
      return `${items(count)} run over six words; tiles read better as a word or a short phrase`;
    case 'SB_NO_EXPLANATION':
      return `${items(count)} ${have(count)} no explanation for a wrong bucket, so the student would be told «wrong» with no reason`;
    case 'SB_BUCKET_NO_RULE':
      return `${buckets(count)} ${have(count)} no rule, so the student gets a verdict but not the principle`;
    case 'SB_COUNTER_ARITHMETIC':
      return 'The «items left» counter is on without a refusal bucket, which turns the last items into arithmetic';
    case 'SB_ONE_SHOT_KEY':
      return 'One check with the key shown means most students will read the key instead of thinking';
    case 'SB_CEILING_LOWERED':
      return issue.cause === 'skew'
        ? "Most items are in one bucket, so a right answer counts as weaker evidence in the student's progress"
        : issue.cause === 'counter'
          ? "The «items left» counter is on, so a right answer counts as weaker evidence in the student's progress"
          : "The «items left» counter is on and most items are in one bucket, so a right answer counts as weaker evidence in the student's progress";
  }
}
