import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpeg = require('fluent-ffmpeg');
import ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

import type { AppConfig } from '../../config/configuration.js';
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

/**
 * Piper publishes Norwegian under `no_NO`, which covers Bokmål; the reader and
 * the vocabulary lists tag their words `nb`. Mapping happens here rather than
 * at the call site so every caller can keep using the tag its content carries.
 */
const LANGUAGE_TO_VOICE_KEY: Record<string, string> = {
  nb: 'no',
  nn: 'no',
  no: 'no',
};

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

    const voiceKey = LANGUAGE_TO_VOICE_KEY[lang.toLowerCase().split(/[-_]/)[0] ?? ''];
    if (!voiceKey) return Result.fail('LANGUAGE_NOT_SUPPORTED');

    const key = this.storageKey(text, voiceKey);

    // The stored object is the cache: an identical word is synthesized once for
    // the whole platform, and nothing has to be written to the database for a
    // derived artifact that can always be regenerated.
    if (await this.storage.objectExists(key, true)) {
      return Result.ok({ url: this.storage.getPublicUrl(key), cached: true });
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const work = this.synthesizeAndStore(text, key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  private storageKey(text: string, voiceKey: string): string {
    // The voice is part of the hash input, so swapping the model in config
    // produces new keys instead of serving the old voice from the old ones.
    const digest = createHash('sha256').update(`${this.tts.piperVoice}|${text}`).digest('hex');
    return `tts/${voiceKey}/${digest}.mp3`;
  }

  private async synthesizeAndStore(
    text: string,
    key: string,
  ): Promise<Result<PronunciationResult, PronunciationError>> {
    try {
      const wav = await this.synthesize(text);
      const mp3 = await this.toMp3(wav);
      await this.storage.uploadObject(key, mp3, 'audio/mpeg', true);
      this.logger.debug(`Synthesized pronunciation for "${text}" (${mp3.length} bytes)`);
      return Result.ok({ url: this.storage.getPublicUrl(key), cached: false });
    } catch (e) {
      this.logger.error(`Pronunciation synthesis failed for "${text}": ${String(e)}`);
      return Result.fail('SYNTHESIS_FAILED');
    }
  }

  private async synthesize(text: string): Promise<Buffer> {
    const res = await fetch(`${this.tts.piperUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: this.tts.piperVoice }),
      signal: AbortSignal.timeout(this.tts.piperTimeoutMs),
    });

    if (!res.ok) throw new Error(`piper responded ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
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
