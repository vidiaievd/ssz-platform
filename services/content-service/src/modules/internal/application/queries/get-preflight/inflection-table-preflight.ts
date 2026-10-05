import { fromPersisted, issues, type Issue } from '@ssz/shared-kernel/inflection-table';

export interface InflectionTablePreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of an `inflection_table`, decided by the same engine the builder runs
 * (plan 69 phase 3). One implementation, so the codes the author sees in the builder are the
 * codes publication refuses with: the rule code here is the kernel's code behind a template
 * prefix, nothing renamed.
 *
 * It earns a place in the preflight query for the structural reason the types before it do:
 * an asked cell without a key is dropped by the projection rather than shown, and the key
 * lives in the column only this query loads alongside the content. A table that published
 * clean would show fewer cells than the author asked — or none.
 *
 * `info` is dropped («row not linked», «key never shown»): it belongs on the card the author is
 * editing, not in a report about a whole container. The clip's own rules are the audio layer's
 * (`audio-preflight.ts`), and none of them is silenced for this type: its transcript is not
 * the key, unlike a dictation's.
 */
export function inflectionTableViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): InflectionTablePreflightViolation[] {
  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per cell: the builder puts each message on the cell it belongs
  // to; a version report doing the same would bury the container under one table.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    if (issue.level === 'info') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `INFLECTIONTABLE_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeInflectionTableIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the secondary line
 * under the copy it does have. `info` codes get a line too, so the switch stays exhaustive.
 */
export function describeInflectionTableIssue(issue: Issue, count: number): string {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const have = (k: number) => (k === 1 ? 'has' : 'have');

  switch (issue.code) {
    case 'IT_NO_PACK':
      return `No paradigm pack for «${issue.language || 'no language'}» yet, so the table has no columns`;
    case 'IT_TOO_FEW_SLOTS':
      return `Only ${n(issue.count, 'column')} in play; one column is a short answer, not a table`;
    case 'IT_SLOT_GONE':
      return `${n(count, 'column')} ${count === 1 ? 'is' : 'are'} no longer in the language pack and need${count === 1 ? 's' : ''} re-approval`;
    case 'IT_NO_ROWS':
      return 'The table has no lemmas yet';
    case 'IT_NOTHING_ASKED':
      return 'Every cell is given; nothing is asked';
    case 'IT_ROW_NO_LEMMA':
      return `${n(count, 'row')} ${have(count)} no lemma`;
    case 'IT_CELL_NO_KEY':
      return `${n(count, 'asked cell')} ${have(count)} no key`;
    case 'IT_ROW_ALL_GIVEN':
      return `${n(count, 'row')} ${count === 1 ? 'is' : 'are'} given in full and ask${count === 1 ? 's' : ''} nothing`;
    case 'IT_FEW_ROWS':
      return `Only ${n(issue.count, 'lemma')}; with so few the student can pattern-match instead of inflecting`;
    case 'IT_MANY_ROWS':
      return `${issue.count} lemmas make a long grid on a phone`;
    case 'IT_SLOT_NEVER_ASKED':
      return `${n(count, 'column')} ${have(count)} no asked cell and only decorate the table`;
    case 'IT_DUPLICATE_LEMMA':
      return `${n(count, 'lemma')} ${count === 1 ? 'repeats' : 'repeat'} a lemma already in the table`;
    case 'IT_ROW_NOT_LINKED':
      return `${n(count, 'row')} ${count === 1 ? 'is' : 'are'} not linked to the course dictionary`;
    case 'IT_CELL_NO_WHY':
      return `${n(count, 'cell')} ${have(count)} a key and no reason, so a wrong answer would be told only «wrong»`;
    case 'IT_BANK_NO_EXTRA':
      return 'The bank has no distractors, so the last cells are filled by elimination';
    case 'IT_BANK_SHORT':
      return `The language pack could make ${n(issue.missing, 'distractor')} fewer than asked for`;
    case 'IT_BANK_TOO_BIG':
      return `${issue.count} forms in the bank turn a grammar task into a scanning one`;
    case 'IT_KEY_NEVER_SHOWN':
      return 'The full paradigm is never shown to the student';
  }
}
