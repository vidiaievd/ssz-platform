import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpeg = require('fluent-ffmpeg');
import ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

import type { AppConfig } from '../../config/configuration.js';
import { SPEECH_SYNTHESIZER, VOICE_RESOLVER } from '../../shared/application/ports/speech-synthesizer.port.js';
import type {
  ISpeechSynthesizer,
  IVoiceResolver,
  ResolvedVoice,
} from '../../shared/application/ports/speech-synthesizer.port.js';
import { STORAGE_SERVICE } from '../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../shared/application/ports/storage.port.js';
import { Result } from '../../shared/kernel/result.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export type PronunciationError = 'TEXT_TOO_LONG' | 'EMPTY_TEXT' | 'LANGUAGE_NOT_SUPPORTED' | 'SYNTHESIS_FAILED';

export interface PronunciationResult {
  url: string;
  /** False when this request is what produced the audio. */
  cached: boolean;
}

@Injectable()
export class PronunciationService {
  private readonly logger = new Logger(PronunciationService.name);
  private readonly tts: AppConfig['tts'];

  /**
   * Two requests for the same unheard word arrive together all the time — a
   * card and its list row, or two students on the same lesson. Sharing the
   * in-flight promise keeps that to one synthesis instead of one per caller.
   */
  private readonly inFlight = new Map<string, Promise<Result<PronunciationResult, PronunciationError>>>();

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    @Inject(SPEECH_SYNTHESIZER) private readonly synthesizer: ISpeechSynthesizer,
    @Inject(VOICE_RESOLVER) private readonly voices: IVoiceResolver,
    config: ConfigService<AppConfig>,
  ) {
    this.tts = config.get<AppConfig['tts']>('tts')!;
  }

  async getOrCreate(
    rawText: string,
    lang: string,
  ): Promise<Result<PronunciationResult, PronunciationError>> {
    const text = rawText.trim();
    if (text.length === 0) return Result.fail('EMPTY_TEXT');
    if (text.length > this.tts.maxTextLength) return Result.fail('TEXT_TOO_LONG');

    const voice = this.voices.resolve(lang, null);
    if (!voice) return Result.fail('LANGUAGE_NOT_SUPPORTED');

    const key = this.storageKey(text, voice);

    // The stored object is the cache: an identical word is synthesized once for
    // the whole platform, and nothing has to be written to the database for a
    // derived artifact that can always be regenerated.
    if (await this.storage.objectExists(key, true)) {
      return Result.ok({ url: this.storage.getPublicUrl(key), cached: true });
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const work = this.synthesizeAndStore(text, lang, voice, key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  /** The voice that speaks `lang`'s clips — what an exercise clip reports as its voice. */
  voiceName(lang: string): string | null {
    return this.voices.resolve(lang, null)?.voice ?? null;
  }

  /**
   * The mp3 bytes of a clip, synthesizing it first when needed. An exercise clip is a copy
   * of this object, not a pointer to it: the shared cache entry sits in the public bucket
   * and can be regenerated at any time, while an exercise asset must stay put.
   */
  async getOrCreateBytes(
    rawText: string,
    lang: string,
  ): Promise<Result<Buffer, PronunciationError>> {
    const clip = await this.getOrCreate(rawText, lang);
    if (clip.isFail) return Result.fail(clip.error);

    const voice = this.voices.resolve(lang, null)!;
    try {
      return Result.ok(await this.storage.getObject(this.storageKey(rawText.trim(), voice), true));
    } catch (e) {
      this.logger.error(`Could not read back pronunciation for "${rawText}": ${String(e)}`);
      return Result.fail('SYNTHESIS_FAILED');
    }
  }

  private storageKey(text: string, { voice, family }: ResolvedVoice): string {
    // The voice is part of the hash input, so swapping the model in config
    // produces new keys instead of serving the old voice from the old ones.
    const digest = createHash('sha256').update(`${voice}|${text}`).digest('hex');
    return `tts/${family}/${digest}.mp3`;
  }

  private async synthesizeAndStore(
    text: string,
    lang: string,
    { voice }: ResolvedVoice,
    key: string,
  ): Promise<Result<PronunciationResult, PronunciationError>> {
    try {
      const wav = await this.synthesizer.synthesize({ text, voice, lang });
      const mp3 = await this.toMp3(wav);
      await this.storage.uploadObject(key, mp3, 'audio/mpeg', true);
      this.logger.debug(`Synthesized pronunciation for "${text}" (${mp3.length} bytes)`);
      return Result.ok({ url: this.storage.getPublicUrl(key), cached: false });
    } catch (e) {
      this.logger.error(`Pronunciation synthesis failed for "${text}": ${String(e)}`);
      return Result.fail('SYNTHESIS_FAILED');
    }
  }

  /**
   * Piper emits 22 kHz mono PCM, which is ~40 KB for a single word. As mp3 the
   * same clip is under 10 KB and every browser plays it without a decoder
   * question, which matters for a button tapped dozens of times per lesson.
   */
  private async toMp3(wav: Buffer): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'tts-'));
    const wavPath = join(dir, 'in.wav');
    const mp3Path = join(dir, 'out.mp3');

    try {
      await writeFile(wavPath, wav);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(wavPath)
          .audioCodec('libmp3lame')
          .audioBitrate('64k')
          .audioChannels(1)
          .on('end', () => resolve())
          .on('error', reject)
          .save(mp3Path);
      });
      return await readFile(mp3Path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
