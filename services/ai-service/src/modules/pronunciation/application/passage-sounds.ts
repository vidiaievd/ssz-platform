import { Injectable } from '@nestjs/common';
import type { PronouncedWord } from '../../providers/domain/speech-result.js';
import { alignWord, type WordAlignment } from '../domain/align-word.js';
import { hasSoundInventory, type SpeechContext } from '../domain/sound-inventory.js';
import { isFunctionWord, weakSounds, type WeakSound } from '../domain/weak-sounds.js';
import { PassageVariants, withPassageWords } from './passage-variants.js';

/** One word Azure scored, its sounds named where the lexicon could, and the weak ones among them. */
export interface WordSounds {
  alignment: WordAlignment;
  weak: WeakSound[];
}

/**
 * The sounds of a passage read aloud (plan 88, step 5): Azure's scored words → the passage's
 * variants narrowed by context (step 4b) → the aligner (step 3) → the sounds below their native
 * threshold. A measurement, nothing more: what to say about it is the caller's.
 */
@Injectable()
export class PassageSounds {
  constructor(private readonly passages: PassageVariants) {}

  /**
   * Beside each of `scored` (Azure's words, in its order); null when the language has no sound
   * inventory or Azure scored no sounds (recognizer only, asked without phonemes). Throws when
   * the lexicon cannot be read.
   */
  async of(
    language: string,
    passage: string,
    scored: readonly PronouncedWord[],
    context: SpeechContext,
  ): Promise<WordSounds[] | null> {
    if (!hasSoundInventory(language) || !scored.some((w) => w.phonemes.length > 0)) return null;
    const words = await this.passages.of(language, passage);
    return withPassageWords(scored, words).map(({ word, passageWord }) => {
      const alignment = alignWord(
        { text: word.text, error: word.error, phonemes: word.phonemes },
        passageWord?.variants ?? [],
      );
      const functionWord = passageWord !== null && isFunctionWord(passageWord.upos, passageWord.variants);
      return { alignment, weak: weakSounds(alignment, context, functionWord) };
    });
  }
}
