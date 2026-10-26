import { Inject, Injectable } from '@nestjs/common';
import type { MediaAssetEntity } from '../../domain/entities/media-asset.entity.js';
import type { AssetVariantInfo } from '../../domain/events/media-processing-completed.event.js';
import {
  SPEECH_MIME_TYPE,
  SPEECH_SAMPLE_RATE,
  SPEECH_VARIANT,
} from '../../domain/policies/recording-policy.js';
import { STORAGE_SERVICE, isPublicEntityType } from '../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../shared/application/ports/storage.port.js';
import { AUDIO_INSPECTOR } from '../../../../shared/application/ports/audio-inspector.port.js';
import type { IAudioInspector } from '../../../../shared/application/ports/audio-inspector.port.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

/**
 * Stores the `speech` variant of a recording (plan 82, step 5) — the WAV that ai-service
 * fetches through the internal playback route for a voice review. One place for the audio
 * worker, which writes it with the playback variants, and the backfill of recordings made
 * before the variant existed.
 */
@Injectable()
export class SpeechVariantWriter {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    @Inject(AUDIO_INSPECTOR) private readonly audio: IAudioInspector,
    private readonly prisma: PrismaService,
  ) {}

  /** `original` is the stored take, `extension` its container as the worker names it. */
  async write(asset: MediaAssetEntity, original: Buffer, extension: string): Promise<AssetVariantInfo> {
    const wav = await this.audio.speechWav(original, extension, SPEECH_SAMPLE_RATE);
    const key = asset.storageKey.variantKey(SPEECH_VARIANT, 'wav').value;

    await this.storage.uploadObject(key, wav, SPEECH_MIME_TYPE, isPublicEntityType(asset.entityType));
    await this.prisma.assetVariant.create({
      data: {
        assetId: asset.id,
        variantType: SPEECH_VARIANT,
        storageKey: key,
        mimeType: SPEECH_MIME_TYPE,
        sizeBytes: BigInt(wav.length),
      },
    });

    return { variantType: SPEECH_VARIANT, storageKey: key, mimeType: SPEECH_MIME_TYPE, sizeBytes: BigInt(wav.length) };
  }
}
