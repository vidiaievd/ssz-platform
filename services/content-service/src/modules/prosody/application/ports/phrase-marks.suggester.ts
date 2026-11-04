import type { GroupBoundary, PhraseAccent, WordLink } from '@ssz/shared-kernel/prosody';
import type { SuggestionRefusal } from '../../domain/prosody-error.js';

export const PHRASE_MARKS_SUGGESTER = Symbol('PHRASE_MARKS_SUGGESTER');

export interface PhraseMarksRequest {
  /** The material's owner school, whose `ai.authoring` pays; null — the author's own plan. */
  schoolId: string | null;
  userId: string;
  language: string;
  text: string;
}

/** Phrase marks anchored to the request's text by the kernel's `tokenize`, source `ai`. */
export interface SuggestedPhraseMarks {
  accents: PhraseAccent[];
  boundaries: GroupBoundary[];
  links: WordLink[];
}

export type PhraseMarksSuggestion =
  | { status: 'ok'; marks: SuggestedPhraseMarks }
  | { status: 'refused'; reason: SuggestionRefusal }
  /** ai-service's error code, or `unreachable` when it did not answer. */
  | { status: 'failed'; errorCode: string };

/**
 * The authoring agent's phrase marks for a text (plan 86, step 5c): ai-service's
 * `prosody_markup`, a language model paid from `ai.authoring`. Never throws — a service that
 * does not answer is a `failed` suggestion.
 */
export interface IPhraseMarksSuggester {
  suggest(request: PhraseMarksRequest): Promise<PhraseMarksSuggestion>;
}
