import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { narrationPauseMs, type NarrationSegment } from '@ssz/shared-kernel/narration';

import type { AppConfig } from '../../../config/configuration.js';
import { buildWav, parseWav, pcmDurationMs, sameFormat, silence } from '../../../infrastructure/audio/wav.js';
import type { Pcm, PcmFormat } from '../../../infrastructure/audio/wav.js';
import { SPEECH_SYNTHESIZER, VOICE_RESOLVER } from '../../../shared/application/ports/speech-synthesizer.port.js';
import type { NarrationStyle } from '../domain/narration-style.js';
import type { ISpeechSynthesizer, IVoiceResolver, ResolvedVoice } from '../../../shared/application/ports/speech-synthesizer.port.js';

export interface RenderedNarration {
  /** One WAV: every segment in order, with the D2 pauses between them. */
  wav: Buffer;
  durationMs: number;
  provider: string;
  /** The narrator's voice model. */
  voice: string;
  /** The narrator's catalog id. */
  voiceId: string;
  /** The speaker inside a multi-speaker model, when the narrator is one. */
  speaker?: string;
}

/**
 * Speaks a narration script segment by segment and joins the PCM.
 *
 * One request per segment keeps every request well inside the synthesizer's timeout however
 * long the lesson is, and is where a per-speaker voice slots in (D1). The segments are spoken
 * one after another: piper is a single CPU-bound process, parallel requests only queue there.
 */
@Injectable()
export class NarrationRenderer {
  constructor(
    @Inject(SPEECH_SYNTHESIZER) private readonly synthesizer: ISpeechSynthesizer,
    @Inject(VOICE_RESOLVER) private readonly voices: IVoiceResolver,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async render(
    lang: string,
    segments: readonly NarrationSegment[],
    delivery: NarrationStyle,
    voiceId?: string,
    speakerVoices?: Readonly<Record<string, string>>,
  ): Promise<RenderedNarration> {
    const narrator = voiceId ? this.voices.byId(lang, voiceId) : this.voices.resolve(lang, null);
    if (!narrator) throw new Error(`no voice speaks ${lang}`);
    if (segments.length === 0) throw new Error('nothing to narrate');

    const tts = this.config.get<AppConfig['tts']>('tts')!;
    // The rhythm's randomness is the same for everyone; pace and pauses are the author's to set.
    // `lengthScale` is relative to the voice's natural pace; the voice's factor evens the voices out.
    // Each voice keeps the author's pace through its own factor, so voices sound evenly paced.
    const styleOf = (voice: ResolvedVoice) => ({
      lengthScale: Math.round(delivery.lengthScale * voice.paceFactor * 1000) / 1000,
      noiseWScale: tts.narrationNoiseWScale,
    });
    /** A turn's speaker speaks with their own voice (plan 74, phase 8); everything else is the narrator's. */
    const voiceOf = (segment: NarrationSegment): ResolvedVoice => {
      const id = segment.kind === 'turn' && segment.speaker ? speakerVoices?.[segment.speaker] : undefined;
      return (id ? this.voices.byId(lang, id) : null) ?? narrator;
    };
    const parts: Buffer[] = [];
    let format: PcmFormat | null = null;

    for (const [index, segment] of segments.entries()) {
      const voice = voiceOf(segment);
      const pcm: Pcm = parseWav(
        await this.synthesizer.synthesize({
          text: segment.text,
          voice: voice.voice,
          ...(voice.speaker ? { speaker: voice.speaker } : {}),
          lang,
          style: styleOf(voice),
        }),
      );
      if (!format) {
        format = pcm;
      } else if (!sameFormat(format, pcm)) {
        throw new Error(`segment ${index} came back in a different PCM format`);
      }

      if (index > 0) parts.push(silence(Math.round(narrationPauseMs(segments[index - 1]!, segment) * delivery.pauseScale), format));
      parts.push(pcm.data);
    }

    const joined: Pcm = { ...format!, data: Buffer.concat(parts) };
    return {
      wav: buildWav(joined),
      durationMs: pcmDurationMs(joined),
      provider: this.synthesizer.provider,
      voice: narrator.voice,
      voiceId: narrator.id,
      ...(narrator.speaker ? { speaker: narrator.speaker } : {}),
    };
  }
}
