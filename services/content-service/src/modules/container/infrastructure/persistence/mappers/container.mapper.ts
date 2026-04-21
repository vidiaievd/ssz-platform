import type { Container } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import {
  prismaContainerTypeToDomain,
  domainContainerTypeToPrisma,
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVisibilityToDomain,
  domainVisibilityToPrisma,
  prismaAccessTierToDomain,
  domainAccessTierToPrisma,
} from './enum-converters.js';

// Shape of data passed to prisma.container.create({ data: ... })
export interface ContainerCreateData {
  id: string;
  slug: string | null;
  containerType: $Enums.ContainerType;
  targetLanguage: string;
  difficultyLevel: $Enums.DifficultyLevel;
  title: string;
  description: string | null;
  coverImageMediaId: string | null;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: $Enums.Visibility;
  accessTier: $Enums.AccessTier;
  currentPublishedVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// Shape of data passed to prisma.container.update({ data: ... })
export type ContainerUpdateData = Partial<Omit<ContainerCreateData, 'id' | 'createdAt'>>;

export class ContainerMapper {
  static toDomain(raw: Container): ContainerEntity {
    return ContainerEntity.reconstitute(raw.id, {
      slug: raw.slug,
      containerType: prismaContainerTypeToDomain(raw.containerType),
      targetLanguage: raw.targetLanguage,
      difficultyLevel: prismaDifficultyToDomain(raw.difficultyLevel),
      title: raw.title,
      description: raw.description,
      coverImageMediaId: raw.coverImageMediaId,
      ownerUserId: raw.ownerUserId,
      ownerSchoolId: raw.ownerSchoolId,
      visibility: prismaVisibilityToDomain(raw.visibility),
      accessTier: prismaAccessTierToDomain(raw.accessTier),
      currentPublishedVersionId: raw.currentPublishedVersionId,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
    });
  }

  static toCreateData(entity: ContainerEntity): ContainerCreateData {
    return {
      id: entity.id,
      slug: entity.slug,
      containerType: domainContainerTypeToPrisma(entity.containerType),
      targetLanguage: entity.targetLanguage,
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      title: entity.title,
      description: entity.description,
      coverImageMediaId: entity.coverImageMediaId,
      ownerUserId: entity.ownerUserId,
      ownerSchoolId: entity.ownerSchoolId,
      visibility: domainVisibilityToPrisma(entity.visibility),
      accessTier: domainAccessTierToPrisma(entity.accessTier),
      currentPublishedVersionId: entity.currentPublishedVersionId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toUpdateData(entity: ContainerEntity): ContainerUpdateData {
    return {
      slug: entity.slug,
      containerType: domainContainerTypeToPrisma(entity.containerType),
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      title: entity.title,
      description: entity.description,
      coverImageMediaId: entity.coverImageMediaId,
      ownerSchoolId: entity.ownerSchoolId,
      visibility: domainVisibilityToPrisma(entity.visibility),
      accessTier: domainAccessTierToPrisma(entity.accessTier),
      currentPublishedVersionId: entity.currentPublishedVersionId,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
