import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../../../../config/configuration.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';
import { restorableUntil } from '../../../domain/policies/narration-retention.js';
import { SupersedeAssetCommand, type SupersedeAssetResult } from './supersede-asset.command.js';

/**
 * Marks a replaced lesson asset; never deletes it.
 *
 * Who may ask is decided by the caller (any lesson author): the mark only starts the
 * retention clock, and the sweep removes nothing a lesson body still names — content-service
 * answers that, not this mark. So two teachers of one school can replace each other's
 * narration, and a mark on an asset that is still in use costs nothing.
 *
 * The replacement is in use from now on, so a mark it carried is cleared: that is how
 * "restore the previous narration" works — the old asset supersedes the new one.
 */
@CommandHandler(SupersedeAssetCommand)
export class SupersedeAssetHandler implements ICommandHandler<SupersedeAssetCommand, SupersedeAssetResult> {
  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async execute(command: SupersedeAssetCommand): Promise<SupersedeAssetResult> {
    const asset = await this.assetRepo.findById(command.assetId);
    if (!asset || asset.isDeleted) return Result.fail('ASSET_NOT_FOUND');

    const replacement = await this.assetRepo.findById(command.byAssetId);
    if (!replacement || replacement.isDeleted) return Result.fail('REPLACEMENT_NOT_FOUND');

    const now = new Date();
    const marked = asset.supersede(replacement.id, now);
    if (marked.isFail) return Result.fail(marked.error);

    const restoredReplacement = replacement.isSuperseded;
    replacement.restore();

    await this.assetRepo.save(asset);
    if (restoredReplacement) await this.assetRepo.save(replacement);

    const retentionDays = this.config.get<AppConfig['tts']>('tts')!.narrationRetentionDays;
    return Result.ok({
      assetId: asset.id,
      supersededAt: now.toISOString(),
      supersededBy: replacement.id,
      restorableUntil: restorableUntil(now, retentionDays).toISOString(),
      restoredReplacement,
    });
  }
}
