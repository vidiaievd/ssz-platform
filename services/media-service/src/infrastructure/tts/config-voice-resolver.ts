import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration.js';
import type { IVoiceResolver, ResolvedVoice } from '../../shared/application/ports/speech-synthesizer.port.js';

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

/**
 * One voice per language family, from config. Piper has a single Norwegian voice, so every
 * speaker gets it; a per-character map is where a multi-voice provider extends this (D1).
 */
@Injectable()
export class ConfigVoiceResolver implements IVoiceResolver {
  private readonly voices: Record<string, string>;

  constructor(config: ConfigService<AppConfig>) {
    const tts = config.get<AppConfig['tts']>('tts')!;
    this.voices = { no: tts.piperVoice };
  }

  resolve(lang: string, _speaker: string | null): ResolvedVoice | null {
    const family = LANGUAGE_TO_FAMILY[lang.toLowerCase().split(/[-_]/)[0] ?? ''];
    const voice = family ? this.voices[family] : undefined;
    return family && voice ? { voice, family } : null;
  }
}
