/**
 * The voices the platform can speak with (plan 74, phase 7). Piper's Norwegian voices:
 * `talesyntese` (one male voice) and the ten speakers of `nvcc`. Both datasets are CC0
 * (Språkbanken, checked 14.10.2026); `nvcc` was trained from scratch.
 *
 * `nvcc` was recorded by speakers from five dialect regions, so some of its voices may speak
 * a regional Norwegian — listen before offering one to learners, and hide it with
 * `TTS_HIDDEN_VOICES` rather than by editing this list.
 */
export type VoiceGender = 'female' | 'male';

export interface CatalogVoice {
  /** Stable id an author's choice is stored under; never the provider's name. */
  id: string;
  /** The language family it speaks (`no` covers nb, nn and no). */
  family: string;
  /** Piper's model name. */
  voice: string;
  /** The speaker inside a multi-speaker model; absent for a single-voice model. */
  speaker?: string;
  gender: VoiceGender;
  /** Shown next to the gender in the editor. */
  name: string;
  /**
   * How much faster or slower than `talesyntese` the voice speaks at the same length scale
   * (measured on one paragraph with steady rhythm: speech seconds 7.15 / the voice's). The
   * renderer multiplies the length scale by it, so "pace ×1.7" sounds alike on every voice.
   */
  paceFactor: number;
}

const NVCC = 'no_NO-nvcc-medium';

export const VOICE_CATALOG: readonly CatalogVoice[] = [
  { id: 'talesyntese', family: 'no', voice: 'no_NO-talesyntese-medium', gender: 'male', name: 'Talesyntese', paceFactor: 1 },
  { id: 'nvcc-kon', family: 'no', voice: NVCC, speaker: 'KON', gender: 'female', name: 'KON', paceFactor: 1.14 },
  { id: 'nvcc-kmn', family: 'no', voice: NVCC, speaker: 'KMN', gender: 'female', name: 'KMN', paceFactor: 0.96 },
  { id: 'nvcc-ksv', family: 'no', voice: NVCC, speaker: 'KSV', gender: 'female', name: 'KSV', paceFactor: 1.05 },
  { id: 'nvcc-knn', family: 'no', voice: NVCC, speaker: 'KNN', gender: 'female', name: 'KNN', paceFactor: 0.97 },
  { id: 'nvcc-knv', family: 'no', voice: NVCC, speaker: 'KNV', gender: 'female', name: 'KNV', paceFactor: 1.01 },
  { id: 'nvcc-mmn', family: 'no', voice: NVCC, speaker: 'MMN', gender: 'male', name: 'MMN', paceFactor: 1.06 },
  { id: 'nvcc-mnn', family: 'no', voice: NVCC, speaker: 'MNN', gender: 'male', name: 'MNN', paceFactor: 0.95 },
  { id: 'nvcc-msv', family: 'no', voice: NVCC, speaker: 'MSV', gender: 'male', name: 'MSV', paceFactor: 1.13 },
  { id: 'nvcc-mnv', family: 'no', voice: NVCC, speaker: 'MNV', gender: 'male', name: 'MNV', paceFactor: 1.07 },
  { id: 'nvcc-mon', family: 'no', voice: NVCC, speaker: 'MON', gender: 'male', name: 'MON', paceFactor: 1.08 },
];
