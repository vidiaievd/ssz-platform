import type { Span } from '../../../../pronunciation/application/text-word-stresses.js';

/** A teacher's ask for phrase marks under one text (plan 86, step 5c) — from content-service's editor route. */
export interface SuggestPhraseMarksRequest {
  /** The school whose `ai.authoring` pays: the material's owner school; null — the author's own plan. */
  schoolId: string | null;
  /** The author who pressed the button. */
  userId: string;
  /** The text's language (`nb`). */
  language: string;
  text: string;
  /** The caller's words in `text`, already checked to be in order and inside it. */
  spans: readonly Span[];
}

export class SuggestPhraseMarksCommand {
  constructor(public readonly request: SuggestPhraseMarksRequest) {}
}
