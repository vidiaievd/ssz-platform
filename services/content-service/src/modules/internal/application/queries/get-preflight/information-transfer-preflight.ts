import { fromPersisted, issues, type Issue } from '@ssz/shared-kernel/information-transfer';

export interface InformationTransferPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of an `information_transfer`, decided by the same engine the builder
 * runs (plan 73). One implementation, so the codes the author sees in the builder are the codes
 * publication refuses with: the rule code here is the kernel's code behind a template prefix,
 * nothing renamed.
 *
 * It earns a place in the preflight query for the structural reason the types before it do: the
 * expected wordings and their explanations are in `expected_answers`, the column only this query
 * loads beside the content. The clip's own rules (no clip, inverted or overrunning timecodes) are
 * the audio layer's and are checked once for every audio-capable template by `audio-preflight.ts`;
 * none is silenced for this type.
 *
 * `info` is dropped («the review card comes later», «typos are on»): it belongs on the card the
 * author is editing, not in a report about a container.
 */
export function informationTransferViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): InformationTransferPreflightViolation[] {
  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per field: the builder puts each message on the field it belongs
  // to; a version report doing the same would bury the container under one exercise.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    if (issue.level === 'info') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `INFORMATIONTRANSFER_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeInformationTransferIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the secondary line
 * under the copy it does have. `info` codes get a line too, so the switch stays exhaustive.
 */
export function describeInformationTransferIssue(issue: Issue, count: number): string {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const have = (k: number) => (k === 1 ? 'has' : 'have');
  const fields = (k: number) => n(k, 'field');

  switch (issue.code) {
    case 'INF_NO_PASSAGE':
      return 'There is no text to read yet';
    case 'INF_NO_TRANSCRIPT':
      return 'The recording has no transcript, so the answers cannot be checked against what is said';
    case 'INF_NO_TITLE':
      return 'The exercise has no title';
    case 'INF_NO_INSTRUCTION':
      return 'The exercise has no instruction';
    case 'INF_NO_PACK':
      return issue.language === ''
        ? 'The exercise has no course language, so spelled-out numbers and dates are not read'
        : `There is no format pack for the language «${issue.language}», so only digits are read`;
    case 'INF_NO_FIELDS':
      return 'The blank has no fields yet';
    case 'INF_FIELD_NO_LABEL':
      return `${fields(count)} ${have(count)} no label`;
    case 'INF_DUPLICATE_LABEL':
      return `${fields(count)} ${have(count)} a label already used by another field`;
    case 'INF_FIELD_NO_KEY':
      return `${fields(count)} ${have(count)} no expected answer`;
    case 'INF_FIELD_NO_WHY':
      return `${fields(count)} ${have(count)} no explanation`;
    case 'INF_KEY_NOT_IN_SOURCE':
      return `${fields(count)} ${have(count)} an answer that is not found in the source`;
    case 'INF_SENTENCE_ANSWER':
      return `${fields(count)} ${have(count)} a sentence for an answer, which is a short-answer question`;
    case 'INF_FEW_FIELDS':
      return `Only ${n(issue.count, 'field')} ${issue.count === 1 ? 'is' : 'are'} ready; ${issue.min} make a blank`;
    case 'INF_MANY_FIELDS':
      return `${n(issue.count, 'field')} is a long blank; ${issue.max} is the most that is usual`;
    case 'INF_ALL_FREE_TEXT':
      return 'Every field is free text, so nothing here is a format the checker reads';
    case 'INF_KEY_UNREADABLE':
      return `${fields(count)} ${have(count)} an expected answer that does not read as its own type`;
    case 'INF_TIME_AMBIGUOUS':
      return `${fields(count)} ${have(count)} a time that reads two ways; write it in 24-hour form`;
    case 'INF_KEY_FAILS_GRADER':
      return 'An expected answer does not pass the checker as typed';
    case 'INF_TYPOS_ON':
      return 'A word one letter off is accepted';
    case 'INF_SPELLED_OFF':
      return 'Numbers spelled out in words are not read';
    case 'INF_CASE_SENSITIVE':
      return 'Capital letters count, so «anne» and «Anne» differ';
    case 'INF_ONE_PLAY_MANY':
      return `One listen has to carry ${n(issue.count, 'field')}, which tests memory more than listening`;
    case 'INF_NO_SEGMENTS':
      return `${n(issue.count, 'field')} could be replayed alone with a timecode`;
    case 'INF_SOURCE_HIDDEN':
      return 'The source is hidden until the answer, so there is nothing to read the answers from';
    case 'INF_PASS_TOO_HIGH':
      return `A pass mark of ${issue.pct}% leaves almost no room for a slip in ${n(issue.count, 'field')}`;
    case 'INF_REQUIRED_ALL':
      return 'Every field must be right to pass';
    case 'INF_NO_MEMORY':
      return 'Nothing is written to the review schedule';
    case 'INF_SKILL_CARD_LATER':
      return 'The skill is recorded as evidence; its own review schedule comes later';
    case 'INF_EXPOSURE_LATER':
      return 'Exposure is stored with the exercise and not yet written to the word';
  }
}
