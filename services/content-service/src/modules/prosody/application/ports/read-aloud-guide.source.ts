import type { GuidePrompt } from '@ssz/shared-kernel/read-aloud';

export const READ_ALOUD_GUIDE_SOURCE = Symbol('READ_ALOUD_GUIDE_SOURCE');

/**
 * What the kernel's `guideIssues` needs beside a read_aloud document (plan 86, step 6h.2c):
 * each prompt's authored layer re-anchored to the text being judged, and the words the
 * lexicon left open in it. Exported for the publication preflight, which judges the draft
 * and so passes the prompt texts it read rather than letting this re-read them.
 */
export interface IReadAloudGuideSource {
  /** Empty prompts are skipped; the lexicon away gives a prompt nothing unresolved. Never throws on the lexicon. */
  guideOf(
    exerciseId: string,
    language: string,
    prompts: readonly { id: string; text: string }[],
  ): Promise<Record<string, GuidePrompt>>;
}
