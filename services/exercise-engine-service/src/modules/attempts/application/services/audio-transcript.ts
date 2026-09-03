import { transcriptOnReveal } from '@ssz/shared-kernel/audio';

/** What the clip said, handed over once there is nothing left to give away. */
export interface AudioTranscript {
  transcript: string;
  translation: string;
}

/**
 * The transcript owed to a learner who has finished — plan 56 §3.3.
 *
 * A listening exercise's transcript is what the clip says, which is the answer, so it is
 * withheld by the student projection and delivered by whatever delivers the key. For the
 * templates this service grades, that is the verdict; the kernel decides *whether*
 * anything is owed (only under `transcriptWhen: 'after'`, and only when the author wrote
 * one), and this decides *when*.
 *
 * **When is the end of the exercise, not the end of an item.** One clip covers the whole
 * set, so handing the transcript over after the first of five questions would answer the
 * other four. That is the whole reason this takes `finished` rather than being called
 * straight from the kernel at each verdict.
 */
export function audioTranscriptFor(content: unknown, finished: boolean): AudioTranscript | undefined {
  if (!finished) return undefined;
  return transcriptOnReveal(content) ?? undefined;
}
