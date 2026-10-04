// The tokenizer lives in `text/words.ts` since plan 68 (decision Q1-A): `dictation` aligns the
// same words. Re-exported here so this module's files and its public surface stay as they were.

export type { Token } from '../text/words.js';
export { tokenize, TOKENIZER_ID, wordsOf } from '../text/words.js';
