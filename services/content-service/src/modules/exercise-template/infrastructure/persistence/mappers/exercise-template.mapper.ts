import type { ExerciseTemplate } from '../../../../../../generated/prisma/client.js';
import { ExerciseTemplateEntity } from '../../../domain/entities/exercise-template.entity.js';

export class ExerciseTemplateMapper {
  /**
   * Converts a Prisma ExerciseTemplate row to a domain entity.
   * supportedLanguages is stored as Json? — null means all languages supported,
   * otherwise cast to string[].
   */
  static toDomain(raw: ExerciseTemplate): ExerciseTemplateEntity {
    return ExerciseTemplateEntity.reconstitute(raw.id, {
      code: raw.code,
      name: raw.name,
      description: raw.description,
      contentSchema: raw.contentSchema as Record<string, unknown>,
      answerSchema: raw.answerSchema as Record<string, unknown>,
      defaultCheckSettings: raw.defaultCheckSettings as Record<string, unknown> | null,
      supportedLanguages: raw.supportedLanguages as string[] | null,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
    });
  }
}
