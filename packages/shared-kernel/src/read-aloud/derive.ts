// Facts read off a `read_aloud` document — the prototype's `raNeeds`, `raPlan`, `raWithNote`,
// `raMax`. Nothing here changes the document.

import { tokenize } from '../text/words.js';
import type { Criterion, Mode, PlanPoint, Prompt, ReadAloudContent } from './model.js';
import { modeConfig } from './model.js';

/** The plan points that say something — empty rows are drafts, not points. */
export function planOf(prompt: Prompt): PlanPoint[] {
  return prompt.plan.filter((p) => p.text.trim() !== '');
}

/** Whether a prompt carries the material its mode needs — without it the microphone opens on nothing. */
export function hasMaterial(prompt: Prompt, mode: Mode): boolean {
  switch (modeConfig(mode).needs) {
    case 'text':
      return prompt.text.trim() !== '';
    case 'support':
      return prompt.image.assetId.trim() !== '' || planOf(prompt).length > 0;
    case 'turn':
      return prompt.turn.partner.trim() !== '';
  }
}

export function hasNote(prompt: Prompt): boolean {
  return prompt.note.trim() !== '';
}

export function withNoteCount(ex: ReadAloudContent): number {
  return ex.prompts.filter(hasNote).length;
}

/** `Σ 3 × weight` — the most one recording can score. */
export function rubricMax(rubric: readonly Pick<Criterion, 'weight'>[]): number {
  return rubric.reduce((n, c) => n + 3 * c.weight, 0);
}

/** The longest prompt, for the gate's «max m:ss per recording». */
export function longestMax(ex: ReadAloudContent): number {
  return ex.prompts.reduce((n, p) => Math.max(n, p.maxSeconds), 0);
}

/** Whether the exercise carries a picture anywhere — a picture monologue reads as `image` input. */
export function hasPicture(ex: ReadAloudContent): boolean {
  return ex.mode === 'monologue' && ex.prompts.some((p) => p.image.assetId.trim() !== '');
}

/** The comparable form of a word: lower-cased, NFC. */
export function wordKey(word: string): string {
  return word.normalize('NFC').toLowerCase();
}

/**
 * Whether a word of the passage is a focus word. Words are tokens of the kernel tokenizer, so
 * punctuation around them never decides (plan 70 §4.2 item 13).
 */
export function focusAt(prompt: Prompt, word: string): Prompt['focus'][number] | undefined {
  const key = wordKey(word);
  return prompt.focus.find((f) => wordKey(f.word) === key);
}

/** The passage split into words and the text between them — what step 2 and the queue draw. */
export interface PassagePiece {
  /** The run of text as written. */
  text: string;
  /** Set on a word; absent on the spaces and punctuation between words. */
  word?: string;
}

export function passagePieces(text: string): PassagePiece[] {
  const out: PassagePiece[] = [];
  let at = 0;
  for (const token of tokenize(text)) {
    if (token.s > at) out.push({ text: text.slice(at, token.s) });
    out.push({ text: token.w, word: token.w });
    at = token.e;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
