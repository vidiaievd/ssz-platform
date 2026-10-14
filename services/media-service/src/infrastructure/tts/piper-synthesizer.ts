import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration.js';
import type { ISpeechSynthesizer, SpeechRequest } from '../../shared/application/ports/speech-synthesizer.port.js';

/** The piper HTTP sidecar (`infrastructure/piper`): POST /synthesize → 22 kHz mono WAV. */
@Injectable()
export class PiperSynthesizer implements ISpeechSynthesizer {
  readonly provider = 'piper';
  private readonly tts: AppConfig['tts'];

  constructor(config: ConfigService<AppConfig>) {
    this.tts = config.get<AppConfig['tts']>('tts')!;
  }

  async synthesize({ text, voice }: SpeechRequest): Promise<Buffer> {
    const res = await fetch(`${this.tts.piperUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
      signal: AbortSignal.timeout(this.tts.piperTimeoutMs),
    });

    if (!res.ok) throw new Error(`piper responded ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
