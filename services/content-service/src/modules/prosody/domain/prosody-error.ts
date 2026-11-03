import type { NotationIssue, ProsodyIssue } from '@ssz/shared-kernel/prosody';

// Business errors of the prosody routes. The two invalid-input errors carry the kernel's
// issue codes so that an editor can point at the place.
export type ProsodyError =
  | { code: 'OWNER_NOT_FOUND' }
  | { code: 'NOT_A_TEXT_LESSON' }
  | { code: 'NOT_READ_ALOUD' }
  | { code: 'PROMPT_NOT_FOUND' }
  | { code: 'PROMPT_HAS_NO_TEXT' }
  | { code: 'NOTATION_INVALID'; issues: NotationIssue[] }
  | { code: 'LAYER_INVALID'; issues: ProsodyIssue[] };
