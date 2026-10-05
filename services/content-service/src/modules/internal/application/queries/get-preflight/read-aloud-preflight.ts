import { audioOn } from '@ssz/shared-kernel/audio';
import { fromPersisted, issues, type Issue } from '@ssz/shared-kernel/read-aloud';

export interface ReadAloudPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `read_aloud`, decided by the same engine the builder runs
 * (plan 70 phase 4). One implementation, so the codes the author sees in the builder are the
 * codes publication refuses with: the rule code here is the kernel's code behind a template
 * prefix, nothing renamed.
 *
 * It earns a place in the preflight query for the structural reason the types before it do:
 * a prompt's listening note — a blocker when empty, because a grader told nothing about what to
 * listen for cannot mark — and the focus words live in `expected_answers`, the column only this
 * query loads beside the content.
 *
 * Whether the audio layer is on is the layer's own flag on the content (`audioOn`), passed to
 * the kernel because the model does not hold the block. `info` is dropped («one take», «no mic
 * check»): it belongs on the card the author is editing, not in a report about a container.
 * The clip's own rules are the audio layer's (`audio-preflight.ts`), none silenced for this type.
 */
export function readAloudViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): ReadAloudPreflightViolation[] {
  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per prompt: the builder puts each message on the prompt it
  // belongs to; a version report doing the same would bury the container under one exercise.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document, { audio: audioOn(exercise.content) })) {
    if (issue.level === 'info') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `READALOUD_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeReadAloudIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the secondary line
 * under the copy it does have. `info` codes get a line too, so the switch stays exhaustive.
 */
export function describeReadAloudIssue(issue: Issue, count: number): string {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const have = (k: number) => (k === 1 ? 'has' : 'have');
  const prompts = (k: number) => n(k, 'prompt');

  switch (issue.code) {
    case 'RA_NO_PROMPTS':
      return 'There is nothing to record yet';
    case 'RA_PROMPT_NO_MATERIAL': {
      const what =
        issue.need === 'text'
          ? 'no text to read'
          : issue.need === 'support'
            ? 'neither a picture nor a plan to speak from'
            : 'no line from the partner';
      return `${prompts(count)} ${have(count)} ${what}`;
    }
    case 'RA_TEXT_TOO_LONG':
      return `${prompts(count)} ${count === 1 ? 'is' : 'are'} longer than 90 words, too much to read in one take`;
    case 'RA_PLAN_TOO_LONG':
      return `${prompts(count)} ${have(count)} more than 5 plan points, which is a script rather than support`;
    case 'RA_MANY_PROMPTS':
      return `${issue.count} prompts make a long session of recording`;
    case 'RA_NO_MODEL':
      return 'A passage to read has no model reading to aim for';
    case 'RA_PARTNER_TEXT_ONLY':
      return 'The partner is only text, so the student never hears the reply they answer';
    case 'RA_NO_NOTE':
      return `${prompts(count)} ${have(count)} no listening note, so the grader is not told what to listen for`;
    case 'RA_NO_FOCUS':
      return 'No prompt has a focus word marked';
    case 'RA_RUBRIC_EMPTY':
      return 'The rubric has no criteria, so there is nothing to mark a recording against';
    case 'RA_CRITERION_NO_NAME':
      return `${n(count, 'criterion', 'criteria')} ${have(count)} no name`;
    case 'RA_PASS_ABOVE_MAX':
      return `The pass mark is ${issue.passScore} points but the rubric gives at most ${issue.max}`;
    case 'RA_LEVEL_EMPTY':
      return `${n(count, 'criterion', 'criteria')} ${have(count)} a level with nothing written`;
    case 'RA_RUBRIC_HIDDEN':
      return 'No criterion is visible to the student';
    case 'RA_MODEL_NEVER_SHOWN':
      return 'The model reading is never shown after the verdict';
    case 'RA_OVER_CEILING':
      return `${prompts(count)} allow${count === 1 ? 's' : ''} more than ${issue.ceiling} seconds, which the upload refuses`;
    case 'RA_RANGE_INVALID':
      return `${prompts(count)} ${have(count)} a minimum length that is not below the maximum, so nothing can be submitted`;
    case 'RA_READ_EXCEEDS_MAX':
      return `${prompts(count)} take${count === 1 ? 's' : ''} longer to read aloud than the maximum allows`;
    case 'RA_BLIND_RETAKES':
      return `${issue.takes} takes without listening back: the student re-records blind`;
    case 'RA_ONE_TAKE':
      return 'One take only';
    case 'RA_CHOOSE_NO_EFFECT':
      return '«Choose the best take» has no effect with one take';
    case 'RA_NO_MIC_CHECK':
      return 'The microphone is not checked before the first recording';
    case 'RA_AI_NOT_LIVE':
      return 'The AI stage is configured but not live yet';
  }
}
