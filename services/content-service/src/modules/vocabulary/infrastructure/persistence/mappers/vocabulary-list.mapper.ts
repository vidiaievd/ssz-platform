import type { VocabularyList } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { VocabularyListEntity } from '../../../domain/entities/vocabulary-list.entity.js';
import {
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVisibilityToDomain,
  domainVisibilityToPrisma,
} from './enum-converters.js';

export interface VocabularyListCreateData {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  targetLanguage: string;
  difficultyLevel: $Enums.DifficultyLevel;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: $Enums.Visibility;
  autoAddToSrs: boolean;
  coverImageMediaId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type VocabularyListUpdateData = Partial<Omit<VocabularyListCreateData, 'id' | 'createdAt'>>;

export class VocabularyListMapper {
  static toDomain(raw: VocabularyList): VocabularyListEntity {
    return VocabularyListEntity.reconstitute(raw.id, {
      slug: raw.slug,
      title: raw.title,
      description: raw.description,
      targetLanguage: raw.targetLanguage,
      difficultyLevel: prismaDifficultyToDomain(raw.difficultyLevel),
      ownerUserId: raw.ownerUserId,
      ownerSchoolId: raw.ownerSchoolId,
      visibility: prismaVisibilityToDomain(raw.visibility),
      autoAddToSrs: raw.autoAddToSrs,
      coverImageMediaId: raw.coverImageMediaId,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
    });
  }

  static toCreateData(entity: VocabularyListEntity): VocabularyListCreateData {
    return {
      id: entity.id,
      slug: entity.slug,
      title: entity.title,
      description: entity.description,
      targetLanguage: entity.targetLanguage,
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      ownerUserId: entity.ownerUserId,
      ownerSchoolId: entity.ownerSchoolId,
      visibility: domainVisibilityToPrisma(entity.visibility),
      autoAddToSrs: entity.autoAddToSrs,
      coverImageMediaId: entity.coverImageMediaId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toUpdateData(entity: VocabularyListEntity): VocabularyListUpdateData {
    return {
      slug: entity.slug,
      title: entity.title,
      description: entity.description,
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      visibility: domainVisibilityToPrisma(entity.visibility),
      autoAddToSrs: entity.autoAddToSrs,
      coverImageMediaId: entity.coverImageMediaId,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
