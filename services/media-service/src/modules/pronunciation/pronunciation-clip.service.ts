import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { toNarrationScript } from '@ssz/shared-kernel/narration';

import { RequestUploadCommand } from '../assets/application/commands/request-upload/request-upload.command.js';
import type { RequestUploadResult } from '../assets/application/commands/request-upload/request-upload.command.js';
import { StoreSynthesizedAudioCommand } from '../assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import type { StoreSynthesizedAudioResult } from '../assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import type { MediaAssetDomainError } from '../assets/domain/exceptions/media-asset.exceptions.js';
import { Result } from '../../shared/kernel/result.js';
import { PronunciationService } from './pronunciation.service.js';
import type { PronunciationError } from './pronunciation.service.js';

export type PronunciationClipError = PronunciationError | 'ASSET_REJECTED';

export interface PronunciationClip {
  assetId: string;
  /** The piper voice that spoke it — the exercise document keeps it as the clip's voice. */
  voice: string;
}

/**
 * A synthesized word as an asset of the caller's, for documents that hold assets and not URLs
 * (plan 72 §3.5). The asset is SYNTHESIZED (plan 74), so the author sees that a machine speaks
 * it; the audio is finalized like an upload, so the processing worker measures the duration
 * and variants exactly as for a recording.
 */
@Injectable()
export class PronunciationClipService {
  constructor(
    private readonly pronunciation: PronunciationService,
    private readonly commandBus: CommandBus,
  ) {}

  async createAsset(
    ownerId: string,
    text: string,
    lang: string,
    exerciseId: string | null,
  ): Promise<Result<PronunciationClip, PronunciationClipError>> {
    const bytes = await this.pronunciation.getOrCreateBytes(text, lang);
    if (bytes.isFail) return Result.fail(bytes.error);

    const requested: Result<RequestUploadResult, MediaAssetDomainError> = await this.commandBus.execute(
      new RequestUploadCommand(
        ownerId,
        'audio/mpeg',
        BigInt(bytes.value.length),
        'pronunciation.mp3',
        'exercise_asset',
        exerciseId,
        'SYNTHESIZED',
      ),
    );
    if (requested.isFail) return Result.fail('ASSET_REJECTED');

    // Synthesis succeeded above, so a voice speaks `lang`.
    const voice = this.pronunciation.voiceName(lang)!;
    const script = toNarrationScript(text.trim(), lang);
    const stored: StoreSynthesizedAudioResult = await this.commandBus.execute(
      new StoreSynthesizedAudioCommand(requested.value.assetId, ownerId, bytes.value, 'audio/mpeg', {
        provider: this.pronunciation.provider,
        voice,
        lang,
        textHash: script.textHash,
        segments: script.segments.length,
      }),
    );
    if (stored.isFail) return Result.fail('ASSET_REJECTED');

    return Result.ok({ assetId: requested.value.assetId, voice });
  }
}
