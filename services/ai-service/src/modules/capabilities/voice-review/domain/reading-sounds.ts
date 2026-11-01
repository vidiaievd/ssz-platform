import type { PronouncedWord } from '../../../providers/domain/speech-result.js';
import type { WordSounds } from '../../../pronunciation/application/passage-sounds.js';
import {
  namedSoundsOf,
  soundAtomId,
  transcriptionOf,
  wordSoundRemarks,
  type NamedSound,
} from '../../../pronunciation/domain/sound-remarks.js';
import type { SoundToExplain } from '../../pronunciation-explain/domain/sound-explanations.js';

/** One prompt of a reading heard at the pronunciation level, with the sounds of its scored words. */
export interface MeasuredPrompt {
  itemId: string;
  /** Azure's scored words, in its order. */
  scored: ReadonlyArray<Pick<PronouncedWord, 'text'>>;
  /** Beside each of `scored`; null when the sounds were not measured. */
  sounds: WordSounds[] | null;
}

/**
 * A weak sound of a handed-in reading as a remark of its draft (plan 88, step 5c): about one
 * word of one prompt, filed under the `sound` atom. In a school the teacher takes, rewords or
 * drops it like any other remark; the atom of one kept goes out as `ai_review`.
 */
export interface ReadingSoundRemark {
  itemId: string;
  /** Position of the prompt among those heard, from 1 — the remark's `sentenceIndex` at the engine. */
  sentenceIndex: number;
  /** Index of the word in the prompt's `pronunciation.words`. */
  wordIndex: number;
  /** The word as Azure scored it — the remark's `fragment`. */
  word: string;
  /** The inventory's English note until a model explains it (step 5c.2). */
  comment: string;
  atomRef: { atomType: 'sound'; atomId: string };
  /** What a model explaining the remark is told. */
  finding: SoundToExplain;
}

/** Every weak sound of the reading as a remark, prompt by prompt, word by word, family by family. */
export function readingSoundRemarks(language: string, prompts: readonly MeasuredPrompt[]): ReadingSoundRemark[] {
  return prompts.flatMap(({ itemId, scored, sounds }, p) =>
    (sounds ?? []).flatMap((measured, wordIndex) => {
      const word = scored[wordIndex]!.text;
      const transcription = transcriptionOf(measured.alignment);
      return wordSoundRemarks(measured.weak).map(({ family, note, severity, symbols }) => ({
        itemId,
        sentenceIndex: p + 1,
        wordIndex,
        word,
        comment: note,
        atomRef: { atomType: 'sound' as const, atomId: soundAtomId(language, family) },
        finding: { word, transcription, family, symbols, severity },
      }));
    }),
  );
}

/** Beside each scored word, its sounds named against the lexicon — or null where they could not be; null when unmeasured. */
export function namedSoundsOfPrompt(sounds: readonly WordSounds[] | null): Array<NamedSound[] | null> | null {
  return sounds === null ? null : sounds.map((s) => namedSoundsOf(s.alignment));
}
