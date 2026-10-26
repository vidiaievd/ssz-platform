/**
 * A word in lexical form — lowercase, punctuation off, hyphens and apostrophes kept (`e-post`) —
 * as `SpeechResult.transcript` promises it. Empty when nothing but punctuation was there (`–`).
 * Numbers stay as written: the engine's reading check reads digits per language.
 */
export function lexicalWord(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}'-]+/gu, '').replace(/^[-']+|[-']+$/g, '');
}

/** The lexical words of a text, in order. */
export function lexicalWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map(lexicalWord)
    .filter((w) => w.length > 0);
}
