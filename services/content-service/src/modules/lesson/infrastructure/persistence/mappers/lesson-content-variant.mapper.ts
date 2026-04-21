import type { LessonContentVariant } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import {
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVariantStatusToDomain,
  domainVariantStatusToPrisma,
} from './enum-converters.js';

// Shape passed to prisma.lessonContentVariant.create({ data: ... })
export interface LessonContentVariantCreateData {
  id: string;
  lessonId: string;
  explanationLanguage: string;
  minLevel: $Enums.DifficultyLevel;
  maxLevel: $Enums.DifficultyLevel;
  displayTitle: string;
  displayDescription: string | null;
  bodyMarkdown: string;
  estimatedReadingMinutes: number | null;
  status: $Enums.VariantStatus;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  lastEditedByUserId: string;
  publishedAt: Date | null;
  deletedAt: Date | null;
}

// Shape passed to prisma.lessonContentVariant.update({ data: ... })
export type LessonContentVariantUpdateData = Partial<
  Omit<LessonContentVariantCreateData, 'id' | 'lessonId' | 'createdAt'>
>;

export class LessonContentVariantMapper {
  static toDomain(raw: LessonContentVariant): LessonContentVariantEntity {
    return LessonContentVariantEntity.reconstitute(raw.id, {
      lessonId: raw.lessonId,
      explanationLanguage: raw.explanationLanguage,
      minLevel: prismaDifficultyToDomain(raw.minLevel),
      maxLevel: prismaDifficultyToDomain(raw.maxLevel),
      displayTitle: raw.displayTitle,
      displayDescription: raw.displayDescription,
      bodyMarkdown: raw.bodyMarkdown,
      estimatedReadingMinutes: raw.estimatedReadingMinutes,
      status: prismaVariantStatusToDomain(raw.status),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      createdByUserId: raw.createdByUserId,
      lastEditedByUserId: raw.lastEditedByUserId,
      publishedAt: raw.publishedAt,
      deletedAt: raw.deletedAt,
    });
  }

  static toCreateData(entity: LessonContentVariantEntity): LessonContentVariantCreateData {
    return {
      id: entity.id,
      lessonId: entity.lessonId,
      explanationLanguage: entity.explanationLanguage,
      minLevel: domainDifficultyToPrisma(entity.minLevel),
      maxLevel: domainDifficultyToPrisma(entity.maxLevel),
      displayTitle: entity.displayTitle,
      displayDescription: entity.displayDescription,
      bodyMarkdown: entity.bodyMarkdown,
      estimatedReadingMinutes: entity.estimatedReadingMinutes,
      status: domainVariantStatusToPrisma(entity.status),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      createdByUserId: entity.createdByUserId,
      lastEditedByUserId: entity.lastEditedByUserId,
      publishedAt: entity.publishedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toUpdateData(entity: LessonContentVariantEntity): LessonContentVariantUpdateData {
    return {
      explanationLanguage: entity.explanationLanguage,
      minLevel: domainDifficultyToPrisma(entity.minLevel),
      maxLevel: domainDifficultyToPrisma(entity.maxLevel),
      displayTitle: entity.displayTitle,
      displayDescription: entity.displayDescription,
      bodyMarkdown: entity.bodyMarkdown,
      estimatedReadingMinutes: entity.estimatedReadingMinutes,
      status: domainVariantStatusToPrisma(entity.status),
      updatedAt: entity.updatedAt,
      lastEditedByUserId: entity.lastEditedByUserId,
      publishedAt: entity.publishedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
