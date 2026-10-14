export const SPEECH_SYNTHESIZER = Symbol('SPEECH_SYNTHESIZER');
export const VOICE_RESOLVER = Symbol('VOICE_RESOLVER');

export interface SpeechRequest {
  text: string;
  /** Provider-specific voice name, as returned by `IVoiceResolver.resolve`. */
  voice: string;
  lang: string;
}

/**
 * Text to speech (plan 74 §4.3). Piper today; a cloud provider with several voices per
 * language plugs in behind the same port (decision D1).
 */
export interface ISpeechSynthesizer {
  /** Name recorded in a synthesized asset's metadata, e.g. `piper`. */
  readonly provider: string;

  /** WAV bytes, PCM 16-bit mono. Throws when the provider fails or times out. */
  synthesize(request: SpeechRequest): Promise<Buffer>;
}

export interface ResolvedVoice {
  voice: string;
  /**
   * The language family the voice speaks — `no` for `nb`, `nn` and `no`. Callers key their
   * caches by it, so the same word tagged `nb` or `no-NO` is synthesized once.
   */
  family: string;
}

export interface IVoiceResolver {
  /**
   * The voice for `lang`, or null when no voice speaks it. `speaker` selects a character's
   * voice where the provider offers several (D1); null means the narrator.
   */
  resolve(lang: string, speaker: string | null): ResolvedVoice | null;
}
