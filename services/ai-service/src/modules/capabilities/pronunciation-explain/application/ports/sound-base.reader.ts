import type { SoundBaseEntry } from '../../domain/sound-base.js';

export const SOUND_BASE_READER = Symbol('ISoundBaseReader');

/**
 * content-service: the sound atoms of a language with their texts in one locale (plan 86,
 * step 9.2). Every family as the catalogue holds it, the Russian/Ukrainian fields unfiltered.
 * Empty for a language without a catalogue; throws when unreadable.
 */
export interface ISoundBaseReader {
  base(language: string, locale: string): Promise<SoundBaseEntry[]>;
}
