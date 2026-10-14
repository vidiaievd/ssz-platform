import { Inject, Injectable } from '@nestjs/common';
import { narrationPauseMs, type NarrationSegment } from '@ssz/shared-kernel/narration';

import { buildWav, parseWav, pcmDurationMs, sameFormat, silence } from '../../../infrastructure/audio/wav.js';
import type { Pcm, PcmFormat } from '../../../infrastructure/audio/wav.js';
import { SPEECH_SYNTHESIZER, VOICE_RESOLVER } from '../../../shared/application/ports/speech-synthesizer.port.js';
import type { ISpeechSynthesizer, IVoiceResolver } from '../../../shared/application/ports/speech-synthesizer.port.js';

export interface RenderedNarration {
  /** One WAV: every segment in order, with the D2 pauses between them. */
  wav: Buffer;
  durationMs: number;
  provider: string;
  /** The narrator's voice. */
  voice: string;
  /** Speakers that were given a voice other than the narrator's; absent while there is one voice. */
  voices?: Record<string, string>;
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
  ) {}

  async render(lang: string, segments: readonly NarrationSegment[]): Promise<RenderedNarration> {
    const narrator = this.voices.resolve(lang, null);
    if (!narrator) throw new Error(`no voice speaks ${lang}`);
    if (segments.length === 0) throw new Error('nothing to narrate');

    const speakerVoices: Record<string, string> = {};
    const parts: Buffer[] = [];
    let format: PcmFormat | null = null;

    for (const [index, segment] of segments.entries()) {
      const voice = segment.speaker ? (this.voices.resolve(lang, segment.speaker) ?? narrator) : narrator;
      if (segment.speaker && voice.voice !== narrator.voice) speakerVoices[segment.speaker] = voice.voice;

      const pcm: Pcm = parseWav(await this.synthesizer.synthesize({ text: segment.text, voice: voice.voice, lang }));
      if (!format) {
        format = pcm;
      } else if (!sameFormat(format, pcm)) {
        throw new Error(`segment ${index} came back in a different PCM format`);
      }

      if (index > 0) parts.push(silence(narrationPauseMs(segments[index - 1]!, segment), format));
      parts.push(pcm.data);
    }

    const joined: Pcm = { ...format!, data: Buffer.concat(parts) };
    return {
      wav: buildWav(joined),
      durationMs: pcmDurationMs(joined),
      provider: this.synthesizer.provider,
      voice: narrator.voice,
      ...(Object.keys(speakerVoices).length > 0 ? { voices: speakerVoices } : {}),
    };
  }
}
