import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { toNarrationScript } from '@ssz/shared-kernel/narration';

import { encodeMp3 } from '../../infrastructure/audio/mp3-encoder.js';
import { buildWav, parseWav, trimSilence } from '../../infrastructure/audio/wav.js';
import { RequestUploadCommand } from '../assets/application/commands/request-upload/request-upload.command.js';
import type { RequestUploadResult } from '../assets/application/commands/request-upload/request-upload.command.js';
import { StoreSynthesizedAudioCommand } from '../assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import type { StoreSynthesizedAudioResult } from '../assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import type { MediaAssetDomainError } from '../assets/domain/exceptions/media-asset.exceptions.js';
import { REFERENCE_SYNTHESIZER } from '../../shared/application/ports/reference-synthesizer.port.js';
import type { IReferenceSynthesizer } from '../../shared/application/ports/reference-synthesizer.port.js';
import { Result } from '../../shared/kernel/result.js';
import { PronunciationService } from './pronunciation.service.js';
import type { PronunciationError } from './pronunciation.service.js';

/**
 * Besides piper's errors, for a named voice (plan 86, step 4z.3): `NOT_A_WORD`, `NOT_AVAILABLE`
 * (switched off, or the voice is not bound) and `REFERENCE_REJECTED` (heard back as another word).
 */
export type PronunciationClipError =
  | PronunciationError
  | 'ASSET_REJECTED'
  | 'NOT_A_WORD'
  | 'NOT_AVAILABLE'
  | 'REFERENCE_REJECTED';

export interface PronunciationClip {
  assetId: string;
  /** The voice that spoke it — the exercise document keeps it as the clip's voice. */
  voice: string;
}

interface Spoken {
  mp3: Buffer;
  provider: string;
  voice: string;
}

/**
 * A synthesized word as an asset of the caller's, for documents that hold assets and not URLs
 * (plan 72 §3.5). The asset is SYNTHESIZED (plan 74), so the author sees that a machine speaks
 * it; the audio is finalized like an upload, so the processing worker measures the duration
 * and variants exactly as for a recording.
 *
 * Without a voice, piper speaks it (the platform's free voice). With one, ai-service's cloud voice
 * says the word alone (plan 86, step 4z.3) — for a contrast piper merges and the kernel pack lists
 * that voice as checked; the WAV, cut to the word (Azure pads it with a second of silence), is
 * stored as mp3 like piper's.
 */
@Injectable()
export class PronunciationClipService {
  private readonly logger = new Logger(PronunciationClipService.name);

  constructor(
    private readonly pronunciation: PronunciationService,
    private readonly commandBus: CommandBus,
    @Inject(REFERENCE_SYNTHESIZER) private readonly cloud: IReferenceSynthesizer,
  ) {}

  async createAsset(
    ownerId: string,
    text: string,
    lang: string,
    exerciseId: string | null,
    voice: string | null = null,
  ): Promise<Result<PronunciationClip, PronunciationClipError>> {
    const spoken = voice ? await this.byCloud(text, lang, voice) : await this.byPiper(text, lang);
    if (spoken.isFail) return Result.fail(spoken.error);
    const { mp3, provider } = spoken.value;

    const requested: Result<RequestUploadResult, MediaAssetDomainError> = await this.commandBus.execute(
      new RequestUploadCommand(
        ownerId,
        'audio/mpeg',
        BigInt(mp3.length),
        'pronunciation.mp3',
        'exercise_asset',
        exerciseId,
        'SYNTHESIZED',
      ),
    );
    if (requested.isFail) return Result.fail('ASSET_REJECTED');

    const script = toNarrationScript(text.trim(), lang);
    const stored: StoreSynthesizedAudioResult = await this.commandBus.execute(
      new StoreSynthesizedAudioCommand(requested.value.assetId, ownerId, mp3, 'audio/mpeg', {
        provider,
        voice: spoken.value.voice,
        lang,
        textHash: script.textHash,
        segments: script.segments.length,
      }),
    );
    if (stored.isFail) return Result.fail('ASSET_REJECTED');

    return Result.ok({ assetId: requested.value.assetId, voice: spoken.value.voice });
  }

  private async byPiper(text: string, lang: string): Promise<Result<Spoken, PronunciationClipError>> {
    const bytes = await this.pronunciation.getOrCreateBytes(text, lang);
    if (bytes.isFail) return Result.fail(bytes.error);
    // Synthesis succeeded, so a voice speaks `lang`.
    return Result.ok({ mp3: bytes.value, provider: this.pronunciation.provider, voice: this.pronunciation.voiceName(lang)! });
  }

  private async byCloud(text: string, lang: string, voice: string): Promise<Result<Spoken, PronunciationClipError>> {
    if (text.trim().length === 0) return Result.fail('EMPTY_TEXT');
    let made;
    try {
      made = await this.cloud.wordAlone(text.trim(), lang, voice);
    } catch (err) {
      this.logger.warn(`Word «${text}» by ${voice} not synthesized: ${err instanceof Error ? err.message : String(err)}`);
      return Result.fail('SYNTHESIS_FAILED');
    }
    if (made.status === 'refused') return Result.fail(made.reason === 'not_a_word' ? 'NOT_A_WORD' : 'NOT_AVAILABLE');
    if (made.status === 'rejected') return Result.fail('REFERENCE_REJECTED');
    let mp3: Buffer;
    try {
      // Azure pads a word alone to ~1.8 s; piper's clips end with the word, so these should too.
      mp3 = await encodeMp3(buildWav(trimSilence(parseWav(made.clip.wav))));
    } catch (err) {
      this.logger.warn(`Word «${text}» by ${voice} not encoded: ${err instanceof Error ? err.message : String(err)}`);
      return Result.fail('SYNTHESIS_FAILED');
    }
    return Result.ok({ mp3, provider: this.cloud.provider, voice: made.clip.voice });
  }
}
