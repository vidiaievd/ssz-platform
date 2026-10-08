import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';

import { FinalizeUploadCommand } from '../assets/application/commands/finalize-upload/finalize-upload.command.js';
import type { FinalizeUploadResult } from '../assets/application/commands/finalize-upload/finalize-upload.command.js';
import { RequestUploadCommand } from '../assets/application/commands/request-upload/request-upload.command.js';
import type { RequestUploadResult } from '../assets/application/commands/request-upload/request-upload.command.js';
import type { MediaAssetDomainError } from '../assets/domain/exceptions/media-asset.exceptions.js';
import { STORAGE_SERVICE } from '../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../shared/application/ports/storage.port.js';
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
 * (plan 72 §3.5). The audio goes through the same request → store → finalize path an upload
 * takes, so the processing worker measures the duration and variants exactly as for a
 * recording — the only difference is who put the bytes in storage.
 */
@Injectable()
export class PronunciationClipService {
  constructor(
    private readonly pronunciation: PronunciationService,
    private readonly commandBus: CommandBus,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
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
      ),
    );
    if (requested.isFail) return Result.fail('ASSET_REJECTED');

    const { assetId, storageKey } = requested.value;
    await this.storage.uploadObject(storageKey, bytes.value, 'audio/mpeg', false);

    const finalized: FinalizeUploadResult = await this.commandBus.execute(
      new FinalizeUploadCommand(assetId, ownerId),
    );
    if (finalized.isFail) return Result.fail('ASSET_REJECTED');

    return Result.ok({ assetId, voice: this.pronunciation.voiceName });
  }
}
