import type { ContainerVersion } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { prismaVersionStatusToDomain, domainVersionStatusToPrisma } from './enum-converters.js';

export interface ContainerVersionCreateData {
  id: string;
  containerId: string;
  versionNumber: number;
  status: $Enums.VersionStatus;
  changelog: string | null;
  createdAt: Date;
  createdByUserId: string;
  publishedAt: Date | null;
  publishedByUserId: string | null;
  deprecatedAt: Date | null;
  sunsetAt: Date | null;
  archivedAt: Date | null;
  revisionCount: number;
}

export type ContainerVersionUpdateData = Partial<
  Omit<ContainerVersionCreateData, 'id' | 'containerId' | 'createdAt' | 'createdByUserId'>
>;

export class ContainerVersionMapper {
  static toDomain(raw: ContainerVersion): ContainerVersionEntity {
    return ContainerVersionEntity.reconstitute(raw.id, {
      containerId: raw.containerId,
      versionNumber: raw.versionNumber,
      status: prismaVersionStatusToDomain(raw.status),
      changelog: raw.changelog,
      createdAt: raw.createdAt,
      createdByUserId: raw.createdByUserId,
      publishedAt: raw.publishedAt,
      publishedByUserId: raw.publishedByUserId,
      deprecatedAt: raw.deprecatedAt,
      sunsetAt: raw.sunsetAt,
      archivedAt: raw.archivedAt,
      revisionCount: raw.revisionCount,
    });
  }

  static toCreateData(entity: ContainerVersionEntity): ContainerVersionCreateData {
    return {
      id: entity.id,
      containerId: entity.containerId,
      versionNumber: entity.versionNumber,
      status: domainVersionStatusToPrisma(entity.status),
      changelog: entity.changelog,
      createdAt: entity.createdAt,
      createdByUserId: entity.createdByUserId,
      publishedAt: entity.publishedAt,
      publishedByUserId: entity.publishedByUserId,
      deprecatedAt: entity.deprecatedAt,
      sunsetAt: entity.sunsetAt,
      archivedAt: entity.archivedAt,
      revisionCount: entity.revisionCount,
    };
  }

  static toUpdateData(entity: ContainerVersionEntity): ContainerVersionUpdateData {
    return {
      status: domainVersionStatusToPrisma(entity.status),
      changelog: entity.changelog,
      publishedAt: entity.publishedAt,
      publishedByUserId: entity.publishedByUserId,
      deprecatedAt: entity.deprecatedAt,
      sunsetAt: entity.sunsetAt,
      archivedAt: entity.archivedAt,
      revisionCount: entity.revisionCount,
    };
  }
}
