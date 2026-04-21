import type { Lesson } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import {
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVisibilityToDomain,
  domainVisibilityToPrisma,
} from './enum-converters.js';

// Shape passed to prisma.lesson.create({ data: ... })
export interface LessonCreateData {
  id: string;
  targetLanguage: string;
  difficultyLevel: $Enums.DifficultyLevel;
  slug: string | null;
  title: string;
  description: string | null;
  coverImageMediaId: string | null;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: $Enums.Visibility;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// Shape passed to prisma.lesson.update({ data: ... })
export type LessonUpdateData = Partial<Omit<LessonCreateData, 'id' | 'createdAt'>>;

export class LessonMapper {
  static toDomain(raw: Lesson): LessonEntity {
    return LessonEntity.reconstitute(raw.id, {
      targetLanguage: raw.targetLanguage,
      difficultyLevel: prismaDifficultyToDomain(raw.difficultyLevel),
      slug: raw.slug,
      title: raw.title,
      description: raw.description,
      coverImageMediaId: raw.coverImageMediaId,
      ownerUserId: raw.ownerUserId,
      ownerSchoolId: raw.ownerSchoolId,
      visibility: prismaVisibilityToDomain(raw.visibility),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
    });
  }

  static toCreateData(entity: LessonEntity): LessonCreateData {
    return {
      id: entity.id,
      targetLanguage: entity.targetLanguage,
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      slug: entity.slug,
      title: entity.title,
      description: entity.description,
      coverImageMediaId: entity.coverImageMediaId,
      ownerUserId: entity.ownerUserId,
      ownerSchoolId: entity.ownerSchoolId,
      visibility: domainVisibilityToPrisma(entity.visibility),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toUpdateData(entity: LessonEntity): LessonUpdateData {
    return {
      targetLanguage: entity.targetLanguage,
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      slug: entity.slug,
      title: entity.title,
      description: entity.description,
      coverImageMediaId: entity.coverImageMediaId,
      ownerSchoolId: entity.ownerSchoolId,
      visibility: domainVisibilityToPrisma(entity.visibility),
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
