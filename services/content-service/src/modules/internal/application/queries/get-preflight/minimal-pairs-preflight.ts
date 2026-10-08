import { fromPersisted, issues, type Issue } from '@ssz/shared-kernel/minimal-pairs';

export interface MinimalPairsPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `minimal_pairs`, decided by the same engine the builder runs
 * (plan 72 phase 4). One implementation, so the codes the author sees in the builder are the
 * codes publication refuses with: the rule code here is the kernel's code behind a template
 * prefix, nothing renamed.
 *
 * It earns a place in the preflight query for the structural reason the types before it do: the
 * teacher's note is in `expected_answers`, the column only this query loads beside the content.
 * The clips' own rules — a word with none, a pair of two voices, a synthesized clip on a
 * contrast that forbids it — are the kernel's too; this service has no media to look at, which
 * is why the duration lives in the document (plan 72 §3.1).
 *
 * `info` is dropped («the contrast card comes later», «no memory»): it belongs on the card the
 * author is editing, not in a report about a container.
 */
export function minimalPairsViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): MinimalPairsPreflightViolation[] {
  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per pair: the builder puts each message on the pair it belongs
  // to; a version report doing the same would bury the container under one exercise.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  for (const issue of issues(document)) {
    if (issue.level === 'info') continue;
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `MINIMALPAIRS_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeMinimalPairsIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the secondary line
 * under the copy it does have. `info` codes get a line too, so the switch stays exhaustive.
 */
export function describeMinimalPairsIssue(issue: Issue, count: number): string {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const have = (k: number) => (k === 1 ? 'has' : 'have');
  const pairs = (k: number) => n(k, 'pair');
  const words = (k: number) => n(k, 'word');

  switch (issue.code) {
    case 'MP_NO_CONTRAST':
      return issue.language === ''
        ? 'The exercise has no contrast to practise'
        : `There is no contrast to choose for the language «${issue.language}»`;
    case 'MP_NO_PAIRS':
      return 'There is nothing to listen to yet';
    case 'MP_PAIR_UNDER_TWO':
      return `${pairs(count)} ${have(count)} fewer than two words, so there is nothing to tell apart`;
    case 'MP_PAIR_DUPLICATE':
      return `${pairs(count)} ${have(count)} two words spelled the same, so the buttons cannot be told apart`;
    case 'MP_GROUP_TOO_LARGE':
      return `${pairs(count)} ${have(count)} more than three words`;
    case 'MP_FEW_PAIRS':
      return `Only ${n(issue.ready, 'pair')} ${issue.ready === 1 ? 'is' : 'are'} ready, which is a short set to practise on`;
    case 'MP_NO_GLOSS':
      return `${pairs(count)} ${have(count)} no translation`;
    case 'MP_MIXED_CONTRASTS':
      return 'The set mixes several contrasts';
    case 'MP_WORD_NO_CLIP':
      return `${words(count)} ${have(count)} no recording`;
    case 'MP_PAIR_MIXED_VOICES':
      return `${pairs(count)} ${have(count)} words in more than one voice, so the voice gives the answer away`;
    case 'MP_TTS_BLOCKED':
      return `${n(issue.count, 'clip')} on «${issue.contrastId}» ${issue.count === 1 ? 'is' : 'are'} synthesized, and synthesis cannot be trusted with this contrast`;
    case 'MP_CLIP_TOO_LONG':
      return `${n(count, 'clip')} ${count === 1 ? 'is' : 'are'} longer than 2.5 seconds`;
    case 'MP_PAIR_LENGTH_SPREAD':
      return `${pairs(count)} ${have(count)} clips whose lengths differ by more than 350 ms, which gives the answer away`;
    case 'MP_TTS_RISKY':
      return `${n(issue.count, 'clip')} on «${issue.contrastId}» ${issue.count === 1 ? 'is' : 'are'} synthesized, and synthesis is unreliable with this contrast`;
    case 'MP_DIALECT_MISSING':
      return 'This contrast depends on the dialect, and a clip does not say which one it is';
    case 'MP_TTS_NOTE':
      return `${n(issue.count, 'clip')} on «${issue.contrastId}» ${issue.count === 1 ? 'is' : 'are'} synthesized`;
    case 'MP_POOL_TOO_SMALL':
      return `The set asks for ${issue.probes} probes but the pairs give only ${issue.pool} without repeating`;
    case 'MP_FEW_PROBES':
      return `${n(issue.probes, 'probe')} is fewer than the ${issue.min} that make a set`;
    case 'MP_MANY_PROBES':
      return `${n(issue.probes, 'probe')} is a long sitting; ${issue.max} is the most that is usual`;
    case 'MP_UNLIMITED_REPLAYS':
      return 'Replays are unlimited, so the student can listen until they are sure';
    case 'MP_TOO_MANY_OPTIONS':
      return `All ${issue.options} words are offered as buttons on every probe`;
    case 'MP_NO_IMMEDIATE':
      return 'The verdict is held back until the end, so a wrong ear is not corrected as it goes';
    case 'MP_NO_AB':
      return 'A miss does not offer to compare the two clips';
    case 'MP_SPELLING_HIDDEN':
      return 'The spelling is hidden until the answer';
    case 'MP_SECOND_CHANCE':
      return 'A miss gets a second try';
    case 'MP_WORD_MEMORY':
      return 'Words are rated on the strength of a choice between two';
    case 'MP_PASS_TOO_HIGH':
      return `A pass mark of ${issue.passPct}% leaves almost no room for a slip in ${n(issue.probes, 'probe')}`;
    case 'MP_NO_MEMORY':
      return 'Nothing is written to the review schedule';
    case 'MP_CONTRAST_CARD_LATER':
      return 'The contrast is recorded as evidence; its own review schedule comes later';
    case 'MP_EXPOSURE_LATER':
      return 'Exposure is stored with the exercise and not yet written to the word';
  }
}
