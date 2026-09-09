import { fromPersisted, issues, type Issue } from '@ssz/shared-kernel/writing-task';

export interface WritingTaskPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `writing_task`, decided by the same engine the builder
 * runs. One implementation, so an author cannot be told the exercise is ready and then
 * have publication refused (the handoff's "one validation engine; every surface filters
 * it", and IMPLEMENTATION.md's "blockers must run server-side too, not only in the gate").
 *
 * The gate this backs is stricter than most: `writing_task` has no auto-check, so an
 * exercise published with an empty rubric or an unreachable pass score cannot be caught
 * later by a student getting a wrong answer. The first person to notice would be the
 * teacher, holding a submitted text and nothing to mark it against.
 *
 * Two kinds of issue the kernel reports do not belong in a publication report and are
 * dropped here:
 *
 * - `AI_STAGE_OFF_DRAFT_ON` is `info`, about a switch that calls nothing in this build
 *   (plan 50 §3.5). A version report has two severities and no place for a remark.
 * - warnings about missing point keywords, which only the unbuilt AI pre-check would
 *   read, are kept — they cost the author nothing to fix now and everything to
 *   backfill across a published course later.
 */
export function writingTaskViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): WritingTaskPreflightViolation[] {
  const document = fromPersisted(
    // Module and timestamp play no part in these rules. The title does not either:
    // the platform already reports a missing one as EXERCISE_INCOMPLETE, and one
    // problem should not appear twice under two names.
    { id: exercise.id, moduleId: '', title: '', updatedAt: '' },
    exercise.content,
    exercise.expectedAnswers,
  );

  // One violation per code, not per point or criterion. The builder lists every
  // criterion missing a descriptor; a version report that did the same would bury the
  // rest of the container under four lines about one exercise.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    if (issue.level === 'info') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `WRITINGTASK_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeWritingTaskIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the
 * secondary line under the copy it does have. Deliberately concrete: "2 criteria" and
 * "12 of 9" are worth more to the author than a rule's name.
 */
export function describeWritingTaskIssue(issue: Issue, count: number): string {
  const criteria = (n: number) => `${n} criteri${n === 1 ? 'on has' : 'a have'}`;

  switch (issue.code) {
    case 'EX_NO_PROMPT':
      return 'The task has no prompt, so the student is told nothing about the situation';
    case 'MODE_NO_SOURCE':
      return 'A retelling task has no source text to retell';
    case 'MODE_NO_RECIPIENT':
      return 'A letter task names no recipient';
    case 'MODE_NO_IMAGE':
      return 'A picture task has no image';
    case 'EX_NO_POINTS':
      return 'The task has no must-cover point, so there is nothing concrete to mark against';
    case 'POINTS_TOO_MANY':
      return `The task has ${issue.count} must-cover points, and becomes a checklist above five`;
    case 'POINT_NO_KEYWORDS':
      return `${count} must-cover point${count === 1 ? ' has' : 's have'} no phrasings for the AI pre-check`;
    case 'EX_NO_MODEL':
      return 'The task has no example answer, so nothing shows the student what a full text looks like';
    case 'LEN_MAX_LTE_MIN':
      return 'The maximum word count is at or below the minimum, so no text can be submitted';
    case 'TIMER_TOO_SHORT':
      return `${issue.timer} minutes is short for a text of at least ${issue.minWords} words`;
    case 'CRIT_NO_NAME':
      return `${criteria(count)} no name`;
    case 'RUBRIC_EMPTY':
      return 'The rubric is empty, so a teacher has nothing to mark the text against';
    case 'PASS_SCORE_TOO_HIGH':
      return `The pass score is ${issue.passScore} of a possible ${issue.max}, so no text can pass`;
    case 'CRIT_LEVEL_EMPTY':
      return `${criteria(count)} an empty level descriptor, and two teachers will grade differently`;
    case 'AI_NO_SELF_LIMIT':
      return 'Students may run the language check before submitting, with no limit on how often';
    // `info`, dropped before this function is reached. Handled so it stays total.
    case 'AI_STAGE_OFF_DRAFT_ON':
      return 'The AI stage is off while its draft rubric is on, so the teacher gets no pre-filled marks';
  }
}
