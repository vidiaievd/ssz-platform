import type { SpeechAudio } from './speech-request.js';

export interface SynthesisResult {
  /** PCM 16-bit, 16 kHz, mono — the format the speech models take, so it can be heard back. */
  audio: SpeechAudio;
  audioMs: number;
  /** The voice that spoke. */
  voice: string;
  /** Characters of the text — what the call is priced by. */
  characters: number;
  providerRequestId: string | null;
  latencyMs: number;
}
