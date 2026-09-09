import { fromPersisted, issues, type Issue, type IssueLevel } from '@ssz/shared-kernel/match-pairs';

export interface MatchPairsPreflightViolation {
  ruleCode: string;
  severity: IssueLevel;
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `match_pairs`, decided by the same engine the builder runs.
 * One implementation, so an author cannot be told the exercise is ready and then have
 * publication refused (AC-X1 of the design handoff).
 *
 * The level of `FB_NO_DEFAULT` depends on the document: a blocker for `halves`, where a
 * wrong half is explicable only by grammar the student cannot see, and a warning for
 * `pairs`, where the reason is on the screen already. That decision lives in the kernel
 * and is not repeated here — see plan 49, decision 3.
 *
 * One thing the builder reports that this cannot: whether the author ever *chose* the
 * variant. An absent field parses as `pairs`, and by the time a document exists the two
 * are indistinguishable, so that blocker is the builder's alone.
 */
export function matchPairsViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): MatchPairsPreflightViolation[] {
  const document = fromPersisted(
    // Title, module and timestamp play no part in the rules that matter here.
    // `EX_NO_TITLE` is dropped below rather than suppressed with a placeholder title,
    // because the platform already reports a missing title as EXERCISE_INCOMPLETE and one
    // problem should not appear twice under two names.
    { id: exercise.id, moduleId: '', title: '', instructions: '', updatedAt: '' },
    exercise.content,
    exercise.expectedAnswers,
  );

  // One violation per code, not per pair. The builder lists every pair missing an
  // explanation; a version report that did the same would bury the rest of the container
  // under thirty lines about one exercise.
  const counted = new Map<string, { level: IssueLevel; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    if (issue.code === 'EX_NO_TITLE') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `MATCHPAIRS_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeMatchPairsIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the
 * secondary line under the copy it does have. Deliberately concrete: "3 pairs" is worth
 * more to the author than the rule's name.
 */
export function describeMatchPairsIssue(issue: Issue, count: number): string {
  const pairs = (n: number) => `${n} pair${n === 1 ? ' has' : 's have'}`;

  switch (issue.code) {
    // Not reachable from pre-flight, which drops this code. Handled so the function
    // stays total.
    case 'EX_NO_TITLE':
      return 'The exercise has no title';
    case 'PAIR_HALF_EMPTY':
      return `${pairs(count)} only one half written`;
    case 'EX_TOO_FEW_PAIRS':
      return `The exercise has ${issue.pairCount} complete pair${issue.pairCount === 1 ? '' : 's'}, and needs at least ${issue.required}`;
    case 'PAIR_LEFT_DUPLICATE':
      return `${pairs(count)} the same left half as an earlier one`;
    case 'PAIR_RIGHT_LONG':
      return `${pairs(count)} a right half over 12 words, which reads badly on a phone`;
    case 'POOL_DUPLICATE':
      return `Two right halves read the same: «${issue.text}»`;
    case 'POOL_NO_DISTRACTORS':
      return 'Extra halves are switched on but none are written, so the final match is free';
    case 'POOL_TOO_SMALL':
      return `Extra halves are off and there are ${issue.pairCount} pairs, so the last matches solve themselves`;
    case 'FB_NO_DEFAULT':
      return `${pairs(count)} no default explanation`;
  }
}
