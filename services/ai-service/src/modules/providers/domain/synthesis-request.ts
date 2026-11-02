import type { TtsFeatures } from './model-features.js';

/**
 * A text to speak (plan 88, step 6b). Provider-neutral, like `SpeechRequest`: every synthesis
 * adapter translates it into its own API's shape.
 */
export interface SynthesisRequest {
  /** Plain text, not markup: the adapter escapes it into its own format. */
  text: string;
  /** The course language (`nb`); the adapter maps it to its provider's locale (`nb-NO`). */
  language: string;
  /** One of the model's voices for the language; null = its default (the first listed). */
  voice: string | null;
  timeoutMs: number;
}

/** How many characters a text is billed as — code points, as the providers count them. */
export function billedCharacters(text: string): number {
  return [...text].length;
}

/**
 * The voice a call speaks with: the one asked for if the model has it for the language, else
 * the language's default; null when the model has none of it — the adapter refuses the call.
 */
export function voiceOf(features: TtsFeatures, language: string, voice: string | null): string | null {
  const voices = features.languages.includes(language) ? (features.voices[language] ?? []) : [];
  if (voice === null) return voices[0] ?? null;
  return voices.includes(voice) ? voice : null;
}
