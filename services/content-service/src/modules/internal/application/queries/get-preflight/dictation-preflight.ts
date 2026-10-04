import { fromPersisted, issues, type Issue } from '@ssz/shared-kernel/dictation';

export interface DictationPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `dictation`, decided by the same engine the builder runs
 * (plan 68). One implementation, so the codes the author sees in the builder are the codes
 * publication refuses with (AC-X1): the rule code here is the kernel's code behind a
 * template prefix, nothing renamed.
 *
 * The clip's own rules (missing, untitled, inverted or overrunning timecodes) are the
 * audio layer's and are checked once for every audio-capable template by
 * `audio-preflight.ts`, which already filters this type's two silenced codes (decision
 * Q3-A of plan 68: the transcript is the key itself, and one playback for a handful of
 * sentences is this type's own `DICT_ONE_PLAY_MANY_SEGMENTS`, not the layer's). This file
 * is only the type's own `DICT_*` codes.
 */
export function dictationViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): DictationPreflightViolation[] {
  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per sentence: the builder puts each message on the
  // sentence it belongs to; a version report doing the same would bury the container
  // under one exercise.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `DICTATION_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeDictationIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the secondary
 * line under the copy it does have.
 */
export function describeDictationIssue(issue: Issue, count: number): string {
  const sentences = (n: number) => `${n} sentence${n === 1 ? '' : 's'}`;
  const have = (n: number) => (n === 1 ? 'has' : 'have');

  switch (issue.code) {
    case 'DICT_NO_TITLE':
      return 'The exercise has no title';
    case 'DICT_CLIP_TOO_LONG':
      return `The clip is ${issue.seconds}s long; past 180s a dictation is a test, not practice`;
    case 'DICT_NO_KEY':
      return 'No sentence has been written yet';
    case 'DICT_EMPTY_SEGMENT':
      return `${sentences(count)} ${have(count)} nothing written`;
    case 'DICT_SEGMENT_TOO_LONG':
      return `${sentences(count)} ${have(count)} more than 18 words, which tests memory rather than spelling`;
    case 'DICT_SEGMENT_TOO_SHORT':
      return `${sentences(count)} ${have(count)} fewer than 3 words, too short to hear a boundary in`;
    case 'DICT_TIMECODE_MISSING':
      return `${sentences(count)} ${have(count)} no timecode, so ${count === 1 ? 'it' : 'they'} cannot be replayed alone`;
    case 'DICT_DUPLICATE_SEGMENT':
      return `${sentences(count)} ${count === 1 ? 'repeats' : 'repeat'} a sentence already written`;
    case 'DICT_TOO_MANY_SEGMENTS':
      return `The exercise has ${issue.count} sentences; past 8 one dictation is a lesson`;
    case 'DICT_NO_WHY':
      return `${sentences(count)} ${have(count)} no reason given for ${count === 1 ? 'its' : 'their'} spelling`;
    case 'DICT_NO_FOCUS':
      return 'No sentence has a focus word marked';
    case 'DICT_FOCUS_WITHOUT_REASON':
      return `${count} focus word${count === 1 ? '' : 's'} ${have(count)} no reason`;
    case 'DICT_TRANSCRIPT_ALWAYS':
      return 'The transcript is shown from the start, which is the answer to every sentence';
    case 'DICT_ONE_PLAY_MANY_SEGMENTS':
      return `One listen has to carry ${issue.count} sentences, which tests memory more than listening`;
    case 'DICT_NO_RETRY_NO_KEY':
      return 'One attempt and no key: a wrong sentence is never explained';
  }
}
