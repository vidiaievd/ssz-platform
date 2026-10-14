import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration.js';
import type { IVoiceResolver, ResolvedVoice } from '../../shared/application/ports/speech-synthesizer.port.js';
import { VOICE_CATALOG } from './voice-catalog.js';
import type { CatalogVoice } from './voice-catalog.js';

/**
 * Piper publishes Norwegian under `no_NO`, which covers Bokmål; the reader and the
 * vocabulary lists tag their words `nb`. Mapping happens here rather than at the call site
 * so every caller can keep using the tag its content carries.
 */
const LANGUAGE_TO_FAMILY: Record<string, string> = {
  nb: 'no',
  nn: 'no',
  no: 'no',
};

const familyOf = (lang: string): string | undefined => LANGUAGE_TO_FAMILY[lang.toLowerCase().split(/[-_]/)[0] ?? ''];

const resolved = (voice: CatalogVoice): ResolvedVoice => ({
  id: voice.id,
  voice: voice.voice,
  ...(voice.speaker ? { speaker: voice.speaker } : {}),
  gender: voice.gender,
  name: voice.name,
  paceFactor: voice.paceFactor,
  family: voice.family,
});

/**
 * The voices of the catalog, minus the ones switched off by `TTS_HIDDEN_VOICES`. The configured
 * `PIPER_VOICE` stays the default: it speaks a word's pronunciation and a narration whose author
 * chose no voice, so existing content sounds as it did. A character in a dialogue still gets the
 * narrator's voice; a per-character map is where this extends (D1).
 */
@Injectable()
export class ConfigVoiceResolver implements IVoiceResolver {
  private readonly voices: CatalogVoice[];
  private readonly defaultVoiceName: string;

  constructor(config: ConfigService<AppConfig>) {
    const tts = config.get<AppConfig['tts']>('tts')!;
    this.defaultVoiceName = tts.piperVoice;
    const hidden = new Set(tts.hiddenVoices);
    this.voices = VOICE_CATALOG.filter((voice) => !hidden.has(voice.id));
  }

  resolve(lang: string, _speaker: string | null): ResolvedVoice | null {
    return this.list(lang)[0] ?? null;
  }

  byId(lang: string, voiceId: string): ResolvedVoice | null {
    const family = familyOf(lang);
    const voice = family ? this.voices.find((v) => v.id === voiceId && v.family === family) : undefined;
    return voice ? resolved(voice) : null;
  }

  list(lang: string): ResolvedVoice[] {
    const family = familyOf(lang);
    if (!family) return [];
    const inFamily = this.voices.filter((voice) => voice.family === family);
    // The configured voice first, then the catalog's order.
    const preferred = inFamily.filter((voice) => voice.voice === this.defaultVoiceName && !voice.speaker);
    return [...preferred, ...inFamily.filter((voice) => !preferred.includes(voice))].map(resolved);
  }
}
