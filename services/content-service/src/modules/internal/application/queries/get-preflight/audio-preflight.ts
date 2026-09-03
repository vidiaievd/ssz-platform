import { audioIssues, itemsOf, type AudioIssue } from '@ssz/shared-kernel/audio';

export interface AudioPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * The audio layer's editorial rules, run by the same engine the builder runs — plan 56
 * §3.8 and README's "Blockers must run server-side at assign time too."
 *
 * The first rule in this directory that is **not per template**. Audio is a block any of
 * the thirteen documents may carry, so a per-template file would have to be written
 * thirteen times and would still miss the fourteenth. It is also why this one is fed by a
 * query of its own: the other rules load the documents of seven templates, and an exercise
 * that says "listen" can be any of them.
 *
 * One blocker, and it is the one that cannot wait for a student to find it: an exercise
 * with listening switched on and nothing attached shows a player with no clip, and — with
 * a `first` gate — items that will never unlock. Everything else the layer warns about is
 * a judgement the author is allowed to make (one listen for six questions is unkind, not
 * broken), so it stays a warning here exactly as it is in the builder.
 *
 * `info` is dropped, as it is for `multiple_choice` and `short_answer`: "a limit next to a
 * scrub bar does not limit" belongs on the card the author is editing, not in a report
 * about a whole container.
 */
export function audioViolations(exercise: {
  id: string;
  templateCode: string;
  content: unknown;
}): AudioPreflightViolation[] {
  // One violation per code, not per item — the builder puts each message on the card it
  // belongs to; a version report doing the same would bury the container under one
  // exercise's timecodes.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: AudioIssue }>();

  for (const issue of audioIssues(exercise.content, itemsOf(exercise.templateCode, exercise.content))) {
    if (issue.level === 'info') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `AUDIO_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeAudioIssue(first, count),
  }));
}

/** The English fallback for a rule code the web has no copy for. */
export function describeAudioIssue(issue: AudioIssue, count: number): string {
  switch (issue.code) {
    case 'AUD_NO_CLIP':
      return 'Listening is switched on but no audio is attached, so the student would be shown a player with nothing to play';
    case 'AUD_NO_TITLE':
      return 'The clip has no title, so the student is asked to listen to something unnamed';
    case 'AUD_NO_TRANSCRIPT':
      return 'The transcript is set to be shown but none is written';
    case 'AUD_ONE_PLAY_MANY_ITEMS':
      return `One listen has to carry ${issue.items} items, which tests memory more than listening`;
    case 'AUD_SEG_INVERTED':
      return `${count} timecode${count === 1 ? '' : 's'} end${count === 1 ? 's' : ''} before ${count === 1 ? 'it starts' : 'they start'}, so the fragment plays nothing`;
    case 'AUD_SEG_BEYOND':
      return `${count} timecode${count === 1 ? '' : 's'} run${count === 1 ? 's' : ''} past the end of the clip`;
    default:
      return 'The audio on this exercise is incomplete';
  }
}
