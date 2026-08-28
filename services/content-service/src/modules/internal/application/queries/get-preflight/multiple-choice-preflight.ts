import {
  fromPersisted,
  isMultipleChoiceDocument,
  issues,
  type Issue,
} from '@ssz/shared-kernel/multiple-choice';

export interface MultipleChoicePreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `multiple_choice`, decided by the same engine the builder
 * runs. One implementation, so an author cannot be told the exercise is ready and then
 * have publication refused (README's "every validation surface is a filter over
 * `mcIssues`", and IMPLEMENTATION.md's "Re-run the blocker rules server-side. The client
 * gate is a courtesy; assignment must not accept an exercise with a missing key or a
 * missing explanation.").
 *
 * Two blockers earn this file, and they are the two the handoff names in that sentence.
 * `Q_NO_KEY` means a question no answer can be right for: the student projection cannot
 * see the key column, so it ships the question regardless, and the first person to find
 * out is a student marked wrong whatever they pick. And `Q_NO_WHY` means a question with
 * no rule written behind the right answer — for this type not a missing nicety but the
 * hole the whole rewrite exists to close, because 48 of the 131 seeded exercises of the
 * old form had no explanation at all and could only ever tell a learner «not right».
 *
 * Documents of the old single-question form are skipped rather than judged. Plan 53 §8 Q2
 * reseeds the first lesson of `norsk-b1` and leaves 121 exercises in the old form, which
 * have no `questions`, no per-question `why` and no per-option rebuttals — running these
 * rules over one would report three blockers on an exercise that works.
 *
 * The `info` level is dropped, as it is for `short_answer`: «this distractor uses an
 * absolute» and «this option reads as "all of these"» are worth a nudge on the card the
 * author is writing and are noise in a report about a whole container.
 */
export function multipleChoiceViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
  /** The course language, for the two audit rules that depend on it (plan 53 §3.6). */
  language?: string;
}): MultipleChoicePreflightViolation[] {
  if (!isMultipleChoiceDocument(exercise.content)) return [];

  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per question or option. The builder puts each message on
  // the card it belongs to; a version report that did the same would bury the rest of the
  // container under a dozen lines about one exercise.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document, { language: exercise.language })) {
    if (issue.level === 'info') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `MULTIPLECHOICE_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeMultipleChoiceIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the
 * secondary line under the copy it does have. Deliberately concrete: "2 questions have
 * no correct option marked" is worth more to the author than a rule's name.
 */
export function describeMultipleChoiceIssue(issue: Issue, count: number): string {
  const questions = (n: number) => `${n} question${n === 1 ? '' : 's'}`;
  const have = (n: number) => (n === 1 ? 'has' : 'have');
  const are = (n: number) => (n === 1 ? 'is' : 'are');

  switch (issue.code) {
    case 'EX_NO_QUESTIONS':
      return 'The set has no questions, so the student would be shown an empty exercise';
    case 'EX_NO_ANSWERABLE_QUESTION':
      return 'No question is finished, so the student would be shown an empty exercise';
    case 'Q_NO_STEM':
      return `${questions(count)} ${have(count)} no text to answer`;
    case 'Q_TOO_FEW_OPTIONS':
      return `${questions(count)} ${have(count)} fewer than two written options (the first has ${issue.count}), so ${count === 1 ? 'it is' : 'they are'} dropped from what the student receives`;
    case 'Q_NO_KEY':
      return `${questions(count)} ${have(count)} no correct option marked, so no answer to ${count === 1 ? 'it' : 'them'} can be right`;
    case 'Q_EMPTY_OPTION':
      return `${questions(count)} ${have(count)} a blank option row; blanks are dropped for the student and the letters renumber`;
    case 'Q_NO_PASSAGE':
      return `${questions(count)} ${are(count)} marked as reading questions and ${have(count)} no passage above the question`;
    case 'OPT_DUPLICATE':
      return `${questions(count)} ${have(count)} two options that say the same thing`;
    case 'KEY_TOO_LONG':
      return `In ${questions(count)} the correct option is much longer than every distractor, which gives it away without reading`;
    case 'KEY_TOO_SHORT':
      return `In ${questions(count)} the correct option is much shorter than every distractor, which gives it away without reading`;
    case 'Q_TWO_OPTIONS':
      return `${questions(count)} offer only two options, so a guess is worth half the marks`;
    case 'INSTANT_WITH_RETRY':
      return 'Instant checking is on together with a second attempt, so the first tap spends the first try';
    case 'ELIMINATE_WITHOUT_RETRY':
      return 'The 50/50 is on and no retry is allowed, so it can never fire';
    case 'Q_NO_WHY':
      return `${questions(count)} ${have(count)} no rule written behind the right answer, so a wrong pick can only be told it is wrong`;
    case 'NO_OPTION_FEEDBACK':
      return 'Rebuttals are switched on and no wrong option has one, so the switch does nothing';
    // Never reached: `info` issues are filtered out above. Named so that a new one added
    // to the kernel makes this switch fail to compile rather than fall through silently.
    case 'OPT_ABSOLUTE':
      return `${questions(count)} ${have(count)} a distractor phrased as an absolute`;
    case 'OPT_ALL_OF_THESE':
      return `${questions(count)} ${have(count)} an option that reads as «all of these»`;
  }
}
