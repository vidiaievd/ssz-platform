import { fromPersisted, issues, type Issue } from '@ssz/shared-kernel/highlight-in-text';

export interface HighlightInTextPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `highlight_in_text`, decided by the same engine the builder
 * runs (plan 67). One implementation, so the codes the author sees in the builder are the
 * codes publication refuses with (AC-X1, AC-X2): the rule code here is the kernel's code
 * behind a template prefix, nothing renamed.
 *
 * Two blockers earn this file. A question with a prompt and no marks is not shown and
 * marked wrong — it is *dropped*: the projection asks the key column whether a question has
 * spans, so the exercise publishes clean with fewer questions than the author wrote, or
 * none. And `HT_SPAN_OFF_TOKENS` is the server's half of decision Q3-A: the server does not
 * re-anchor on save, so a span that no longer starts and ends on token edges of the current
 * text — written by a client that tokenized differently — would grade every right answer as
 * a near miss. This is where it is stopped.
 */
export function highlightInTextViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): HighlightInTextPreflightViolation[] {
  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per question or span: the builder puts each message on the
  // question it belongs to; a version report doing the same would bury the container under
  // one exercise.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `HIGHLIGHTINTEXT_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeHighlightInTextIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the secondary
 * line under the copy it does have.
 */
export function describeHighlightInTextIssue(issue: Issue, count: number): string {
  const questions = (n: number) => `${n} question${n === 1 ? '' : 's'}`;
  const marks = (n: number) => `${n} mark${n === 1 ? '' : 's'}`;
  const have = (n: number) => (n === 1 ? 'has' : 'have');

  switch (issue.code) {
    case 'HT_NO_TEXT':
      return 'There is no passage to mark in';
    case 'HT_NO_TITLE':
      return 'The exercise has no title';
    case 'HT_TEXT_SHORT':
      return `The passage is ${issue.words} words long; under 25 the feature cannot repeat in it`;
    case 'HT_TEXT_LONG':
      return `The passage is ${issue.words} words long; over 260 it is a long scroll on a phone`;
    case 'HT_ORPHANED_MARKS':
      return `${marks(issue.count)} lost ${issue.count === 1 ? 'its' : 'their'} words when the passage was edited and ${issue.count === 1 ? 'waits' : 'wait'} to be put back or dropped`;
    case 'HT_NO_QUESTIONS':
      return 'The exercise has no questions';
    case 'HT_QUESTION_NO_PROMPT':
      return `${questions(count)} ${have(count)} no wording, so the student would not know what to mark`;
    case 'HT_QUESTION_NO_SPANS':
      return `${questions(count)} ${have(count)} nothing marked, so ${count === 1 ? 'it is' : 'they are'} dropped from what the student receives`;
    case 'HT_SPANS_OVERLAP':
      return `${questions(count)} ${have(count)} two marks over the same word`;
    case 'HT_SPAN_OFF_TOKENS':
      return `${marks(count)} no longer ${count === 1 ? 'sits' : 'sit'} on whole words of the passage, so a right answer would be graded as a near miss`;
    case 'HT_TOO_FEW_SPANS':
      return `${questions(count)} ${have(count)} only one or two marks, so one lucky tap passes`;
    case 'HT_DENSITY_HIGH':
      return `A question marks ${Math.round(issue.share * 100)}% of the passage, so marking everything scores well`;
    case 'HT_UNIT_MISMATCH':
      return `${questions(count)} ${count === 1 ? 'asks' : 'ask'} for single words but ${count === 1 ? 'contains' : 'contain'} a phrase mark`;
    case 'HT_DUPLICATE_PROMPT':
      return 'Two questions ask the same thing';
    case 'HT_TOO_MANY_QUESTIONS':
      return `The exercise has ${issue.count} questions; past four one text turns into a worksheet`;
    case 'HT_NO_MISS_HINT':
      return `${questions(count)} ${have(count)} no hint for a missed mark, so the student would be told «not found» with no reason`;
    case 'HT_NO_FP_HINT':
      return `${questions(count)} ${have(count)} no hint for an extra mark`;
    case 'HT_PENALTY_OFF':
      return "Extra marks cost nothing, so marking everything passes and a right answer counts as weaker evidence in the student's progress";
    case 'HT_COUNT_SHOWN':
      return "The number of marks is shown, so a right answer counts as weaker evidence in the student's progress";
    case 'HT_ONE_SHOT_REVEAL':
      return 'One check with the key shown means most students will read the key instead of thinking';
  }
}
