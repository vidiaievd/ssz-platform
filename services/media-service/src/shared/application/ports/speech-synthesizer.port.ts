export const SPEECH_SYNTHESIZER = Symbol('SPEECH_SYNTHESIZER');
export const VOICE_RESOLVER = Symbol('VOICE_RESOLVER');

export interface SpeechRequest {
  text: string;
  /** Provider-specific voice name, as returned by `IVoiceResolver.resolve`. */
  voice: string;
  /** The speaker inside a multi-speaker model (`ResolvedVoice.speaker`). */
  speaker?: string;
  lang: string;
  /**
   * Delivery of the voice, for providers that expose it (Piper does; others may ignore it).
   * Omitted means the voice's own defaults — what a one-word pronunciation clip wants.
   */
  style?: SpeechStyle;
}

export interface SpeechStyle {
  /** Phoneme length multiplier: above 1 speaks slower. */
  lengthScale?: number;
  /**
   * Randomness of phoneme and pause lengths. Piper's default (0.8) drops pauses of over a second
   * at random inside a sentence; 0 makes the rhythm the same on every render.
   */
  noiseWScale?: number;
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
  /** The catalog id an author's choice is stored under (`talesyntese`, `nvcc-kon`, …). */
  id: string;
  voice: string;
  /** The speaker inside a multi-speaker model, passed to the provider as is. */
  speaker?: string;
  gender: 'female' | 'male';
  /** Shown next to the gender in the editor. */
  name: string;
  /** Multiplier on the length scale so one pace sounds alike on every voice. */
  paceFactor: number;
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

  /** A voice the author picked, or null when it does not exist, is hidden or does not speak `lang`. */
  byId(lang: string, voiceId: string): ResolvedVoice | null;

  /** Every voice offered for `lang`, the default first. */
  list(lang: string): ResolvedVoice[];
}
