import {
  fromPersisted,
  issues,
  type Issue,
  type IssueLevel,
} from '@ssz/shared-kernel/wordbank-gapfill';

export interface GapFillPreflightViolation {
  ruleCode: string;
  severity: IssueLevel;
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `word_bank_gap_fill`, decided by the same engine the
 * builder runs. One implementation, so an author cannot be told the exercise is ready
 * and then have publication refused (AC-X1 of the design handoff).
 *
 * This is also what stands in for the spec's `state: draft | ready`: the platform
 * already gates publication through container pre-flight, and a second readiness model
 * would contend with it (plan 35, decision 5).
 */
export function gapFillViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): GapFillPreflightViolation[] {
  const document = fromPersisted(
    // Title, module and timestamp play no part in the rules that matter here.
    // `EX_NO_TITLE` is dropped below rather than suppressed with a placeholder
    // title, because the platform already reports a missing title as
    // EXERCISE_INCOMPLETE and one problem should not appear twice under two names.
    { id: exercise.id, moduleId: '', title: '', instructions: '', updatedAt: '' },
    exercise.content,
    exercise.expectedAnswers,
  );

  // One violation per code, not per gap. The builder lists every gap missing a "why";
  // a version report that did the same would bury the rest of the container under
  // sixty lines about one exercise.
  const counted = new Map<string, { level: IssueLevel; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    if (issue.code === 'EX_NO_TITLE') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `GAPFILL_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeGapFillIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the
 * secondary line under the copy it does have. Deliberately concrete: "3 gaps" is worth
 * more to the author than the rule's name.
 */
export function describeGapFillIssue(issue: Issue, count: number): string {
  const gaps = (n: number) => `${n} gap${n === 1 ? ' has' : 's have'}`;

  switch (issue.code) {
    // Not reachable from pre-flight, which drops this code. Handled so the
    // function stays total.
    case 'EX_NO_TITLE':
      return 'The exercise has no title';
    case 'EX_NO_SENTENCES':
      return 'The exercise has no sentences';
    case 'SENT_EMPTY':
      return `${count} sentence${count === 1 ? ' is' : 's are'} empty`;
    case 'SENT_NO_GAP':
      return `${count} sentence${count === 1 ? ' has' : 's have'} no gap marked`;
    case 'BANK_DUPLICATE':
      return `«${issue.word}» is both a correct answer and a distractor`;
    case 'BANK_TOO_FEW':
      return `The word bank has ${issue.bankSize} word${issue.bankSize === 1 ? '' : 's'} — too few to be a choice`;
    case 'BANK_TOO_SMALL':
      return `The bank has ${issue.bankSize} words for ${issue.gapCount} gap${issue.gapCount === 1 ? '' : 's'}, so it is solvable by elimination`;
    case 'FB_PAIRS_UNUSED':
      return `${issue.pairCount} word-specific explanations are never shown: this exercise is typed, not chosen`;
    case 'FB_NO_FALLBACK':
      return `${gaps(count)} no default explanation`;
    case 'FB_NO_WHY':
      return `${gaps(count)} no note on why the answer is right`;
    case 'FB_PARTIAL_COVERAGE':
      return `${issue.total - issue.written} of ${issue.total} word pairs fall back to the default explanation`;
  }
}
