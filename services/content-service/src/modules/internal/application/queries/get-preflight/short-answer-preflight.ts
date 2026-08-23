import {
  fromPersisted,
  isShortAnswerDocument,
  issues,
  type Issue,
} from '@ssz/shared-kernel/short-answer';

export interface ShortAnswerPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `short_answer`, decided by the same engine the builder
 * runs. One implementation, so an author cannot be told the exercise is ready and then
 * have publication refused (README's "one engine, every surface filters it", and
 * IMPLEMENTATION.md's "Re-run the blocker rules server-side at assign time. The client
 * gate is a courtesy.").
 *
 * The blocker that earns this file is `Q_MODEL_FAILS_KEY`: the author's own model answer
 * run through the author's own key. It is the one check that catches a key which looks
 * finished and matches nothing — an anchor phrased the way the teacher thinks rather
 * than the way anyone writes. Plan 50's equivalent tool found five of thirteen documents
 * failing it; here the same check guards every publish. Without it the first person to
 * notice would be a student, told their correct answer covered none of the points.
 *
 * Documents of the old single-question form are skipped rather than judged. Plan 51 §8
 * Q1 leaves them live, and they have no elements, no model answer and no `why` — running
 * these rules over one would report four blockers on an exercise that works.
 */
export function shortAnswerViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): ShortAnswerPreflightViolation[] {
  if (!isShortAnswerDocument(exercise.content)) return [];

  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per question or element. The builder puts each message
  // on the card it belongs to; a version report that did the same would bury the rest of
  // the container under a dozen lines about one exercise.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    if (issue.level === 'info') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `SHORTANSWER_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeShortAnswerIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the
 * secondary line under the copy it does have. Deliberately concrete: "covers 1 of 3" is
 * worth more to the author than a rule's name.
 */
export function describeShortAnswerIssue(issue: Issue, count: number): string {
  const questions = (n: number) => `${n} question${n === 1 ? '' : 's'}`;

  switch (issue.code) {
    case 'EX_NO_QUESTIONS':
      return 'The exercise has no questions, so there is nothing to answer';
    case 'Q_NO_PROMPT':
      return `${questions(count)} ${count === 1 ? 'has' : 'have'} no text`;
    case 'Q_NO_MODEL':
      return `${questions(count)} ${count === 1 ? 'has' : 'have'} no model answer, so there is nothing to validate the key against`;
    case 'Q_NO_PASSAGE':
      return `${questions(count)} ask about a text that is not there`;
    case 'Q_NO_KEY':
      return `${questions(count)} ${count === 1 ? 'has' : 'have'} no answer key, so nothing can be checked`;
    case 'Q_MODEL_FAILS_KEY':
      return `${questions(count)} ${count === 1 ? 'has a model answer' : 'have model answers'} that ${count === 1 ? 'does' : 'do'} not pass ${count === 1 ? 'its' : 'their'} own key (the first covers ${issue.covered} of ${issue.total}), so no student answer will either`;
    case 'EL_NO_ANCHOR':
      return `${count} answer element${count === 1 ? ' has' : 's have'} no phrase to look for, so ${count === 1 ? 'it' : 'they'} can never be matched`;
    case 'EL_ANCHOR_NOT_IN_MODEL':
      return `${count} answer element${count === 1 ? "'s only phrase does" : "s' only phrases do"} not appear in the model answer (the first is «${issue.anchor}»)`;
    case 'Q_TOO_MANY_ELEMENTS':
      return `${questions(count)} ${count === 1 ? 'has' : 'have'} more than four elements, which reads like an essay rather than a short answer`;
    case 'Q_NO_WHY':
      return `${questions(count)} ${count === 1 ? 'has' : 'have'} no explanation to show under the verdict`;
    case 'PASS_N_TOO_HIGH':
      return `The pass rule asks for ${issue.passN} elements, and some questions have fewer`;
    case 'NO_TEACHER_REVIEW':
      return 'Nobody ever reads these answers — only the phrase match decides';
    // `info`, dropped before this function is reached. Handled so it stays total.
    case 'EL_ANCHOR_TOO_SHORT':
      return `«${issue.anchor}» is short enough to appear in an answer by accident`;
    case 'EL_ONE_ANCHOR':
      return `${count} answer element${count === 1 ? ' carries' : 's carry'} a single phrase, and students will word it differently`;
  }
}
