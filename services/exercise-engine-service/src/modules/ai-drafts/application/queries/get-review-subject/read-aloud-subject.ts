import {
  fromPersisted,
  machineCanCheck,
  readingPassPercent,
  readSubmission,
} from '@ssz/shared-kernel/read-aloud';

/** One prompt the machine checks: the passage to read and the take the learner chose for it. */
export interface ReadAloudSubjectPrompt {
  /** The prompt id — what the verdict's rows are keyed by. */
  itemId: string;
  label: string;
  /** The passage, as the author wrote it. The kernel's check normalizes it, not ai-service. */
  text: string;
  /** The words the author grades by ear — feedback beside the check, never part of it (Q4). */
  focus: string[];
  /** The chosen take, by media id. ai-service fetches its `speech` variant itself (step 5). */
  assetId: string;
  /** The recording's length as the learner's client reported it; media measures it again. */
  seconds: number;
}

/** What ai-service checks a `read_aloud` reading from (plan 82, step 6). */
export interface ReadAloudSubject {
  template: 'read_aloud';
  /** The language learnt, as the attempt records it (`nb`) — the recognizer's language. */
  targetLanguage: string;
  /** Share of a prompt's words that passes it, whole percent (`review.readingPassPercent`). */
  passPercent: number;
  /**
   * The author's AI stage as stored — ai-service decides what it allows. Whether the payer's
   * plan has the pronunciation level (`ai.voice_review_pronunciation`) is its gate's to read,
   * not the subject's: the engine asks the plan only whether anyone answers at all.
   */
  ai: { on: boolean; checks: { transcript: boolean; pronunciation: boolean; fluency: boolean } };
  /** The prompts recorded in this try, in the exercise's order. */
  prompts: ReadAloudSubjectPrompt[];
  /**
   * Prompts carried from a returned try (plan 70, phase 11b). They keep the teacher's ruling
   * and are not checked again; listed so a verdict over `prompts` is known to be partial.
   */
  carriedItemIds: string[];
}

/**
 * The passages beside the recordings that read them, for the machine's reading check.
 *
 * `ai.on` is the kernel's `machineCanCheck` — `read` mode, the AI stage with the transcript
 * check, a passage on every prompt — so a `monologue` or `dialogue` exercise (Q7) reads as
 * "AI off" here, and the resolver answers `none` for it as it does for any author's switch.
 *
 * A submission that does not read, or a prompt the document no longer holds, leaves nothing to
 * check against — such a prompt is dropped; the validator refused a submission missing one.
 */
export function readAloudSubject(
  content: unknown,
  expectedAnswers: unknown,
  submittedAnswer: unknown,
  targetLanguage: string,
): ReadAloudSubject {
  const document = fromPersisted(content, expectedAnswers);
  const recordings = new Map((readSubmission(submittedAnswer)?.recordings ?? []).map((r) => [r.itemId, r]));

  const prompts: ReadAloudSubjectPrompt[] = [];
  const carriedItemIds: string[] = [];
  for (const prompt of document.prompts) {
    const recording = recordings.get(prompt.id);
    if (!recording) continue;
    if (recording.carried) {
      carriedItemIds.push(prompt.id);
      continue;
    }
    prompts.push({
      itemId: prompt.id,
      label: prompt.label,
      text: prompt.text,
      focus: prompt.focus.map((f) => f.word),
      assetId: recording.assetId,
      seconds: recording.seconds,
    });
  }

  const { ai } = document.review;
  return {
    template: 'read_aloud',
    targetLanguage,
    passPercent: readingPassPercent(document),
    ai: {
      on: machineCanCheck(document) && prompts.length > 0,
      checks: { transcript: ai.transcript, pronunciation: ai.pronunciation, fluency: ai.fluency },
    },
    prompts,
    carriedItemIds,
  };
}
