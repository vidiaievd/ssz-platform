import type { NotationIssue, ProsodyIssue } from '@ssz/shared-kernel/prosody';

// Business errors of the prosody routes. The invalid-input errors carry the kernel's
// issue codes so that an editor can point at the place; the two suggestion errors carry what
// ai-service answered (plan 86, step 5c.2).
export type ProsodyError =
  | { code: 'OWNER_NOT_FOUND' }
  | { code: 'NOT_A_TEXT_LESSON' }
  | { code: 'NOT_READ_ALOUD' }
  | { code: 'PROMPT_NOT_FOUND' }
  | { code: 'PROMPT_HAS_NO_TEXT' }
  | { code: 'NOTATION_INVALID'; issues: NotationIssue[] }
  | { code: 'LAYER_INVALID'; issues: ProsodyIssue[] }
  /** Step 6h.2b: a layer sent as JSON that is not the kernel's shape; `errors` are field paths. */
  | { code: 'LAYER_MALFORMED'; errors: string[] }
  /** Step 6h.2b: another save came first; null — the layer it expected was removed. */
  | { code: 'LAYER_MODIFIED_ELSEWHERE'; currentUpdatedAt: Date | null }
  | { code: 'SUGGESTION_REFUSED'; reason: SuggestionRefusal }
  | { code: 'SUGGESTION_FAILED'; errorCode: string };

/**
 * Why ai-service made no suggestion, on purpose: `language_not_supported` (only `nb`),
 * `no_words`, `too_long` (over 1 500 words), `not_available` (agent off, or the payer's plan
 * has no `ai.authoring`), `pool_empty` (the payer's credits for the period are spent).
 */
export type SuggestionRefusal =
  | 'language_not_supported'
  | 'no_words'
  | 'too_long'
  | 'not_available'
  | 'pool_empty';
