import type { AiFeedback, AiFeedbackItem, AiFeedbackPhoneme, AiFeedbackWord } from '@ssz/contracts';
import type { SpeechResult } from '../../../providers/domain/speech-result.js';
import type { WordSounds } from '../../../pronunciation/application/passage-sounds.js';
import type { SoundExplanations, SoundToExplain } from '../../pronunciation-explain/domain/sound-explanations.js';
import { familyOf, soundOf, type SoundFamily } from '../../../pronunciation/domain/sound-inventory.js';
import type { WeakSound } from '../../../pronunciation/domain/weak-sounds.js';

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

/** The `sound` atom of a family (plan 86 Q5): the language's inventory and the family in it. */
export function soundAtomId(language: string, family: SoundFamily): string {
  return `${language}:${family}`;
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
      if (at !== null && measured.alignment.status === 'aligned') {
        phonemesOf.set(
          at,
          measured.alignment.sounds.map((s) => ({ symbol: s.ipa ?? '', accuracy: s.accuracy })),
        );
      }
      const transcription =
        measured.alignment.status === 'aligned' ? measured.alignment.sounds.map((s) => s.ipa ?? '?').join('') : '';
      for (const [family, weak] of byFamily(measured.weak)) {
        remarks.push(
          soundRemark(language, family, weak, word.text, transcription, passageIndex, at === null ? null : offset + at),
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

/** A word's weak sounds by family, in the order first met: two weak ʉ in one word are one remark. */
function byFamily(weak: readonly WeakSound[]): Map<SoundFamily, WeakSound[]> {
  const out = new Map<SoundFamily, WeakSound[]>();
  for (const sound of weak) out.set(sound.family, [...(out.get(sound.family) ?? []), sound]);
  return out;
}

/**
 * The remark on a word's family. `major` when the sound scored under half its threshold — kj
 * said as k scores 0–18 against 53 (§0.2); a near miss is `minor`.
 */
function soundRemark(
  language: string,
  family: SoundFamily,
  weak: WeakSound[],
  word: string,
  transcription: string,
  passageIndex: number,
  wordIndex: number | null,
): SoundRemark {
  const worst = weak.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
  const { title } = familyOf(family);
  const severity = worst.accuracy < worst.threshold / 2 ? 'major' : 'minor';
  return {
    item: {
      kind: 'pronunciation',
      target: { passageIndex, ...(wordIndex === null ? {} : { wordIndex }) },
      original: word,
      explanation: `${title}: ${soundOf(worst.symbols[0]!)!.articulation}`,
      atomRef: { atomType: 'sound', atomId: soundAtomId(language, family), title },
      severity,
    },
    finding: { word, transcription, family, symbols: [...new Set(weak.flatMap((w) => w.symbols))], severity },
  };
}
