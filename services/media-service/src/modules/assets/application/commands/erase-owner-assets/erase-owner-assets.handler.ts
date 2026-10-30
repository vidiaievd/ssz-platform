import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { EraseOwnerAssetsCommand, type EraseOwnerAssetsResult } from './erase-owner-assets.command.js';
import { STORAGE_SERVICE, isPublicEntityType } from '../../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../../shared/application/ports/storage.port.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

/**
 * VoxOrd plan 07, step 3d. Unlike AssetPurger (a soft delete that keeps the row), this drops
 * the rows too: a recording's row holds its file name and what it was attached to. Assets
 * already soft-deleted are included — their objects are deleted again, which S3 allows.
 *
 * Objects first, rows after, per asset: an asset whose objects could not all be deleted keeps
 * its row, so the retry still knows the keys. `media.deleted` is not published — nobody
 * outside this service holds the user's files once every service erases them.
 */
@CommandHandler(EraseOwnerAssetsCommand)
export class EraseOwnerAssetsHandler implements ICommandHandler<EraseOwnerAssetsCommand, EraseOwnerAssetsResult> {
  private readonly logger = new Logger(EraseOwnerAssetsHandler.name);

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: EraseOwnerAssetsCommand): Promise<EraseOwnerAssetsResult> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { ownerId: command.ownerId },
      select: {
        id: true,
        storageKey: true,
        entityType: true,
        variants: { select: { storageKey: true } },
      },
    });

    const erasable: string[] = [];
    let objects = 0;
    let failed = 0;
    for (const asset of assets) {
      const isPublic = isPublicEntityType(asset.entityType);
      const keys = [asset.storageKey, ...asset.variants.map((v) => v.storageKey)];
      const results = await Promise.allSettled(keys.map((key) => this.storage.deleteObject(key, isPublic)));
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (rejected.length > 0) {
        failed += 1;
        this.logger.warn(
          `Asset ${asset.id}: ${rejected.length} object(s) not deleted — row kept for the retry: ${String(rejected[0].reason)}`,
        );
        continue;
      }
      objects += keys.length;
      erasable.push(asset.id);
    }

    if (erasable.length > 0) {
      // Children first — the relations have no ON DELETE CASCADE.
      await this.prisma.$transaction([
        this.prisma.processingJob.deleteMany({ where: { assetId: { in: erasable } } }),
        this.prisma.assetVariant.deleteMany({ where: { assetId: { in: erasable } } }),
        this.prisma.mediaAsset.deleteMany({ where: { id: { in: erasable } } }),
      ]);
    }

    this.logger.log(`Erased owner ${command.ownerId}: assets=${erasable.length} objects=${objects}`);
    if (failed > 0) {
      throw new Error(`${failed} asset(s) of owner ${command.ownerId} kept: storage delete failed`);
    }
    return { assets: erasable.length, objects };
  }
}
