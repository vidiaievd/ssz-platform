import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { SUBMISSION_RECORDING } from '../../domain/policies/recording-policy.js';
import type {
  FindAssetsOptions,
  IMediaAssetRepository,
  RecordingSweepCursor,
} from '../../domain/repositories/media-asset.repository.interface.js';
import { MediaAssetEntity } from '../../domain/entities/media-asset.entity.js';
import { MediaAssetMapper } from './mappers/media-asset.mapper.js';

@Injectable()
export class PrismaMediaAssetRepository implements IMediaAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<MediaAssetEntity | null> {
    const raw = await this.prisma.mediaAsset.findUnique({ where: { id } });
    return raw ? MediaAssetMapper.toDomain(raw) : null;
  }

  async findByIdAndOwner(id: string, ownerId: string): Promise<MediaAssetEntity | null> {
    const raw = await this.prisma.mediaAsset.findFirst({
      where: { id, ownerId },
    });
    return raw ? MediaAssetMapper.toDomain(raw) : null;
  }

  async findByIds(ids: readonly string[]): Promise<MediaAssetEntity[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.mediaAsset.findMany({ where: { id: { in: [...ids] } } });
    return rows.map((row) => MediaAssetMapper.toDomain(row));
  }

  async findMany(options: FindAssetsOptions): Promise<MediaAssetEntity[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        ...(options.ownerId ? { ownerId: options.ownerId } : {}),
        ...(options.entityType ? { entityType: options.entityType } : {}),
        ...(options.entityId ? { entityId: options.entityId } : {}),
        ...(!options.includeDeleted ? { deletedAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 20,
      skip: options.offset ?? 0,
    });
    return rows.map((row) => MediaAssetMapper.toDomain(row));
  }

  async countMany(options: FindAssetsOptions): Promise<number> {
    return this.prisma.mediaAsset.count({
      where: {
        ...(options.ownerId ? { ownerId: options.ownerId } : {}),
        ...(options.entityType ? { entityType: options.entityType } : {}),
        ...(options.entityId ? { entityId: options.entityId } : {}),
        ...(!options.includeDeleted ? { deletedAt: null } : {}),
      },
    });
  }

  async findRecordingsOlderThan(
    olderThan: Date,
    after: RecordingSweepCursor | null,
    limit: number,
  ): Promise<MediaAssetEntity[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        entityType: SUBMISSION_RECORDING,
        status: { not: 'DELETED' },
        createdAt: { lt: olderThan },
        ...(after === null
          ? {}
          : {
              OR: [
                { createdAt: { gt: after.createdAt } },
                { createdAt: after.createdAt, id: { gt: after.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => MediaAssetMapper.toDomain(row));
  }

  async save(entity: MediaAssetEntity): Promise<void> {
    const exists = await this.prisma.mediaAsset.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    if (exists) {
      await this.prisma.mediaAsset.update({
        where: { id: entity.id },
        data: MediaAssetMapper.toUpdateData(entity),
      });
    } else {
      await this.prisma.mediaAsset.create({
        data: MediaAssetMapper.toCreateData(entity),
      });
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.mediaAsset.delete({ where: { id } });
  }
}
