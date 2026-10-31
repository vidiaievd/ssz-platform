import type { AiFeedback, AiFeedbackWord } from '@ssz/contracts';
import type { SpeechResult } from '../../../providers/domain/speech-result.js';

/** One passage as the speech model heard it. */
export interface PassageHearing {
  passageIndex: number;
  heard: Pick<SpeechResult, 'words' | 'pronunciation'>;
}

/**
 * A reading aloud rehearsed, in the contract's shape: every word heard, passage by passage,
 * with its timings and — when the model scored pronunciation — its accuracy. No remarks and
 * no summary: nobody explains the measurements yet (plan 86). Which passage words were left
 * out is the reading check's to say, in exercise-engine.
 */
export function toVoiceFeedback(hearings: readonly PassageHearing[]): AiFeedback {
  return {
    summary: '',
    items: [],
    words: hearings.flatMap(({ passageIndex, heard }) => {
      const accuracy = accuracyOfHeard(heard);
      return heard.words.map(
        (word, i): AiFeedbackWord => ({
          text: word.text,
          passageIndex,
          ...(accuracy ? { accuracy: accuracy[i]! } : {}),
          startMs: word.startMs,
          endMs: word.endMs,
          phonemes: [],
        }),
      );
    }),
  };
}

/**
 * The accuracy of each heard word, in the order heard. The scores are aligned with the passage
 * — words left out are there with no audio — so every scored word but the omissions stands for
 * one heard word. When the counts disagree the pairing is a guess, and no accuracy is given.
 */
function accuracyOfHeard(heard: PassageHearing['heard']): number[] | null {
  if (!heard.pronunciation) return null;
  const spoken = heard.pronunciation.words.filter((w) => w.error !== 'omission');
  return spoken.length === heard.words.length ? spoken.map((w) => w.accuracy) : null;
}
