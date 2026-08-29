import {
  fromPersisted,
  isMultipleChoiceGroupDocument,
  issues,
  type Issue,
} from '@ssz/shared-kernel/multiple-choice-group';

export interface MultipleChoiceGroupPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `multiple_choice_group`, decided by the same engine the
 * builder runs. One implementation, so an author cannot be told the table is ready and
 * then have publication refused (README: "Port `mgIssues` verbatim in behaviour. Every
 * validation surface is a filter over its output").
 *
 * Two blockers earn this file, and they are the two that fail silently.
 * `ROW_NO_ANSWER` is a statement no answer can be right for: the student projection reads
 * the key column only to ask whether a row is ready, so an unmarked row is *dropped* — the
 * table publishes clean and shows fewer statements than the author wrote. `EX_TOO_FEW_READY`
 * is the end of that road: a table where nothing was ever marked projects as an empty
 * exercise, and nobody is told.
 *
 * It is also the reason this file exists rather than the builder's gate alone. The gate
 * runs where the author is; publication runs over a whole container, and plan 54 §5
 * deviation 5 deliberately lets an untouched document show a grey rail dot rather than a
 * red one. The rail says «nothing here yet»; this says no.
 *
 * Documents of the old form are skipped rather than judged. Two seeded exercises are
 * written that way until phase 3 (plan 54 §1.1) and they have no `rows`, no columns and no
 * per-row key — running these rules over one would report a fistful of blockers on an
 * exercise that works.
 *
 * The `info` level is dropped, as it is for `multiple_choice` and `short_answer`: «this
 * statement uses an absolute» and «fewer than four statements» are worth a nudge on the
 * row the author is writing and are noise in a report about a whole container.
 */
export function multipleChoiceGroupViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
  /** The course language, for the audit rules that depend on it (plan 53 §3.6, carried). */
  language?: string;
}): MultipleChoiceGroupPreflightViolation[] {
  if (!isMultipleChoiceGroupDocument(exercise.content)) return [];

  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per row or column. The builder puts each message on the
  // row it belongs to; a version report that did the same would bury the rest of the
  // container under a dozen lines about one table.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document, { language: exercise.language })) {
    if (issue.level === 'info') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `MULTIPLECHOICEGROUP_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeMultipleChoiceGroupIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the secondary
 * line under the copy it does have. Deliberately concrete: "2 statements have no column
 * marked, so they are dropped" is worth more to the author than a rule's name.
 */
export function describeMultipleChoiceGroupIssue(issue: Issue, count: number): string {
  const statements = (n: number) => `${n} statement${n === 1 ? '' : 's'}`;
  const have = (n: number) => (n === 1 ? 'has' : 'have');
  const they = (n: number) => (n === 1 ? 'it is' : 'they are');

  switch (issue.code) {
    case 'COL_TOO_FEW':
      return `The table has ${issue.count} answer column${issue.count === 1 ? '' : 's'}; a statement needs at least two to choose between`;
    case 'COL_TOO_MANY':
      return `The table has ${issue.count} answer columns; four is the most a row of them stays readable at`;
    case 'COL_NO_LABEL':
      return `${count} answer column${count === 1 ? ' has' : 's have'} no label, so the table header would be blank`;
    case 'COL_DUPLICATE':
      return `Two answer columns carry the same label, so the student cannot tell them apart`;
    case 'SOURCE_EMPTY':
      return 'The material is set to be shown with the exercise, but the passage is empty';
    case 'EX_NO_INSTRUCTION':
      return 'The table has no instruction line above it';
    case 'EX_NO_ROWS':
      return 'The table has no statements, so the student would be shown an empty exercise';
    case 'ROW_NO_ANSWER':
      return `${statements(count)} ${have(count)} no column marked, so ${they(count)} dropped from what the student receives`;
    case 'EX_TOO_FEW_READY':
      return `Only ${issue.count} statement${issue.count === 1 ? ' is' : 's are'} finished; a table needs two the student can be shown`;
    case 'ROW_EMPTY':
      return `${issue.count} statement row${issue.count === 1 ? ' is' : 's are'} empty and will be dropped`;
    case 'ROW_DUPLICATE':
      return `${statements(count)} say the same thing as another`;
    case 'ROW_TOO_LONG':
      return `${statements(count)} ${have(count)} more than 170 characters (the first has ${issue.length}), which reads as a paragraph rather than a claim`;
    case 'ROW_DOUBLE_NEGATIVE':
      return `${statements(count)} ${have(count)} two negations, so being right depends on untangling the sentence rather than on the text`;
    case 'KEY_LOPSIDED':
      return `${Math.round(issue.share * 100)}% of the answers fall in one column, so a student who never read the text passes by picking it every time`;
    case 'COL_UNUSED':
      return `${count} answer column${count === 1 ? ' is' : 's are'} never the right one, so ${count === 1 ? 'it' : 'they'} only ever ${count === 1 ? 'reads' : 'read'} as a decoy`;
    case 'NO_RETRY_NO_KEY':
      return 'No retry is allowed and the key is never revealed, so a student is told they were wrong and never which statements';
    case 'UNLIMITED_UNLOCKED':
      return 'Checks are unlimited and correct rows do not freeze, so the table can be brute-forced';
    case 'NO_EXPLANATIONS':
      return 'Explanations are switched on and no statement has one, so the switch does nothing';
    case 'ROW_NO_WHY':
      return `${statements(count)} ${have(count)} no explanation while others do`;
    case 'QUOTE_NOT_IN_TEXT':
      return `${statements(count)} quote a line that is not in the passage word for word, so the highlight would find nothing`;
    // Never reached: `info` issues are filtered out above. Named so that a new one added
    // to the kernel makes this switch fail to compile rather than fall through silently.
    case 'SOURCE_NONE':
      return 'No material is attached, so the statements are answered from memory';
    case 'ROW_ABSOLUTE':
      return `${statements(count)} ${have(count)} an absolute («alltid», «aldri», «alle»), which usually gives the answer away`;
    case 'ROW_IS_QUESTION':
      return `${statements(count)} ${have(count)} written as a question rather than as a claim`;
    case 'EX_FEW_ROWS':
      return `The table has ${issue.count} finished statement${issue.count === 1 ? '' : 's'}; four is where the type starts to measure anything`;
    case 'EX_MANY_ROWS':
      return `The table has ${issue.count} finished statements, which is more than one screen of checking`;
    case 'THRESHOLD_NEAR_CHANCE':
      return `The pass mark is ${issue.threshold}%, which is at or below guessing on two columns`;
    case 'NO_QUOTES':
      return 'The passage is attached and no statement quotes a line of it';
  }
}
