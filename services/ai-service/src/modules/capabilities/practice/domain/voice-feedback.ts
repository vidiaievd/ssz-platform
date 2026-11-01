import type { AiFeedback, AiFeedbackItem, AiFeedbackPhoneme, AiFeedbackWord } from '@ssz/contracts';
import type { SpeechResult } from '../../../providers/domain/speech-result.js';
import type { WordSounds } from '../../../pronunciation/application/passage-sounds.js';
import type { SoundExplanations, SoundToExplain } from '../../pronunciation-explain/domain/sound-explanations.js';
import {
  namedSoundsOf,
  soundAtomId,
  transcriptionOf,
  wordSoundRemarks,
  type WordSoundRemark,
} from '../../../pronunciation/domain/sound-remarks.js';

/** One passage as the speech model heard it. */
export interface PassageHearing {
  passageIndex: number;
  heard: Pick<SpeechResult, 'words' | 'pronunciation'>;
  /**
   * Beside each of `heard.pronunciation.words`, its sounds (plan 88, step 5); absent or null
   * when they were not measured — no scores, a language with no inventory, the lexicon down.
   */
  sounds?: WordSounds[] | null;
}

/**
 * A reading aloud rehearsed, in the contract's shape: every word heard, passage by passage,
 * with its timings and — when the model scored pronunciation — its accuracy and its sounds.
 * Which passage words were left out is the reading check's to say, in exercise-engine.
 *
 * Sounds (plan 88, step 5): one remark per word and family whose sound fell below the native
 * threshold, pointing at the `sound` atom. Its explanation is the sound's articulation from the
 * inventory, in English — what stays when no model explains it (`withSoundExplanations`, step 5b).
 */
export function toVoiceFeedback(hearings: readonly PassageHearing[], language: string): AiFeedback {
  const { words, remarks } = read(hearings, language);
  return { summary: '', items: remarks.map((r) => r.item), words };
}

/** What each sound remark of `toVoiceFeedback` is about, in the order of its items — for the model that explains them. */
export function soundFindings(hearings: readonly PassageHearing[], language: string): SoundToExplain[] {
  return read(hearings, language).remarks.map((r) => r.finding);
}

/**
 * The feedback with the model's explanations on its sound remarks, in their order, and its
 * summary (step 5b). The remarks stay where they were and what they point at; only the words change.
 */
export function withSoundExplanations(feedback: AiFeedback, explained: SoundExplanations): AiFeedback {
  let next = 0;
  const items = feedback.items.map((item) =>
    item.atomRef?.atomType === 'sound'
      ? { ...item, explanation: explained.explanations[next++] ?? item.explanation }
      : item,
  );
  return { ...feedback, summary: explained.summary, items };
}

interface SoundRemark {
  item: AiFeedbackItem;
  finding: SoundToExplain;
}

function read(
  hearings: readonly PassageHearing[],
  language: string,
): { words: AiFeedbackWord[]; remarks: SoundRemark[] } {
  const words: AiFeedbackWord[] = [];
  const remarks: SoundRemark[] = [];
  for (const { passageIndex, heard, sounds } of hearings) {
    const offset = words.length;
    const heardIndex = heardIndexOfScored(heard);
    const scored = heard.pronunciation?.words ?? [];
    const spoken = scored.filter((w) => w.error !== 'omission');
    const phonemesOf = new Map<number, AiFeedbackPhoneme[]>();

    scored.forEach((word, j) => {
      const measured = sounds?.[j];
      if (!measured) return;
      const at = heardIndex?.[j] ?? null;
      const named = namedSoundsOf(measured.alignment);
      if (at !== null && named) phonemesOf.set(at, named);
      const transcription = transcriptionOf(measured.alignment);
      for (const remark of wordSoundRemarks(measured.weak)) {
        remarks.push(
          soundRemark(language, remark, word.text, transcription, passageIndex, at === null ? null : offset + at),
        );
      }
    });

    heard.words.forEach((word, i) => {
      words.push({
        text: word.text,
        passageIndex,
        ...(heardIndex ? { accuracy: spoken[i]!.accuracy } : {}),
        startMs: word.startMs,
        endMs: word.endMs,
        phonemes: phonemesOf.get(i) ?? [],
      });
    });
  }
  return { words, remarks };
}

/**
 * Index of the heard word each scored word stands for. The scores are aligned with the passage
 * — words left out are there with no audio — so every scored word but the omissions stands for
 * one heard word. When the counts disagree the pairing is a guess: null, and no accuracy is given.
 */
function heardIndexOfScored(heard: PassageHearing['heard']): Array<number | null> | null {
  if (!heard.pronunciation) return null;
  const scored = heard.pronunciation.words;
  if (scored.filter((w) => w.error !== 'omission').length !== heard.words.length) return null;
  let i = 0;
  return scored.map((w) => (w.error === 'omission' ? null : i++));
}

/** The remark on a word's family, in the contract's shape, and what the model explaining it is told. */
function soundRemark(
  language: string,
  remark: WordSoundRemark,
  word: string,
  transcription: string,
  passageIndex: number,
  wordIndex: number | null,
): SoundRemark {
  const { family, title, note, severity, symbols } = remark;
  return {
    item: {
      kind: 'pronunciation',
      target: { passageIndex, ...(wordIndex === null ? {} : { wordIndex }) },
      original: word,
      explanation: note,
      atomRef: { atomType: 'sound', atomId: soundAtomId(language, family), title },
      severity,
    },
    finding: { word, transcription, family, symbols, severity },
  };
}
