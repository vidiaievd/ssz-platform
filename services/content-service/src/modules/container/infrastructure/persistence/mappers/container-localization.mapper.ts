import type { ContainerLocalization } from '../../../../../../generated/prisma/client.js';
import { ContainerLocalizationEntity } from '../../../domain/entities/container-localization.entity.js';

export interface ContainerLocalizationCreateData {
  id: string;
  containerId: string;
  languageCode: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
}

export type ContainerLocalizationUpdateData = Pick<
  ContainerLocalizationCreateData,
  'title' | 'description' | 'updatedAt'
>;

export class ContainerLocalizationMapper {
  static toDomain(raw: ContainerLocalization): ContainerLocalizationEntity {
    return ContainerLocalizationEntity.reconstitute(raw.id, {
      containerId: raw.containerId,
      languageCode: raw.languageCode,
      title: raw.title,
      description: raw.description,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      createdByUserId: raw.createdByUserId,
    });
  }

  static toCreateData(entity: ContainerLocalizationEntity): ContainerLocalizationCreateData {
    return {
      id: entity.id,
      containerId: entity.containerId,
      languageCode: entity.languageCode,
      title: entity.title,
      description: entity.description,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      createdByUserId: entity.createdByUserId,
    };
  }

  static toUpdateData(entity: ContainerLocalizationEntity): ContainerLocalizationUpdateData {
    return {
      title: entity.title,
      description: entity.description,
      updatedAt: entity.updatedAt,
    };
  }
}
