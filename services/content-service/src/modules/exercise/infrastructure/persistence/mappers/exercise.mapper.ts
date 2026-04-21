import type { Exercise, ExerciseInstruction } from '../../../../../../generated/prisma/client.js';
import { $Enums, Prisma } from '../../../../../../generated/prisma/client.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { ExerciseInstructionMapper } from './exercise-instruction.mapper.js';
import {
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVisibilityToDomain,
  domainVisibilityToPrisma,
} from './enum-converters.js';

// The repository always loads exercises with their template (select code only).
// This avoids a separate query and provides templateCode for event payloads.
export type ExerciseWithTemplate = Exercise & {
  template: { code: string };
  instructions?: ExerciseInstruction[];
};

export interface ExerciseCreateData {
  id: string;
  exerciseTemplateId: string;
  targetLanguage: string;
  difficultyLevel: $Enums.DifficultyLevel;
  content: Prisma.InputJsonValue;
  expectedAnswers: Prisma.InputJsonValue;
  answerCheckSettings: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: $Enums.Visibility;
  estimatedDurationSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type ExerciseUpdateData = Partial<
  Omit<
    ExerciseCreateData,
    'id' | 'exerciseTemplateId' | 'targetLanguage' | 'ownerUserId' | 'ownerSchoolId' | 'createdAt'
  >
>;

export class ExerciseMapper {
  static toDomain(raw: ExerciseWithTemplate): ExerciseEntity {
    const instructions = raw.instructions
      ? raw.instructions.map((i) => ExerciseInstructionMapper.toDomain(i))
      : null;

    return ExerciseEntity.reconstitute(raw.id, {
      exerciseTemplateId: raw.exerciseTemplateId,
      templateCode: raw.template.code,
      targetLanguage: raw.targetLanguage,
      difficultyLevel: prismaDifficultyToDomain(raw.difficultyLevel),
      content: raw.content as Record<string, unknown>,
      expectedAnswers: raw.expectedAnswers as Record<string, unknown>,
      answerCheckSettings: raw.answerCheckSettings as Record<string, unknown> | null,
      ownerUserId: raw.ownerUserId,
      ownerSchoolId: raw.ownerSchoolId,
      visibility: prismaVisibilityToDomain(raw.visibility),
      estimatedDurationSeconds: raw.estimatedDurationSeconds,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
      instructions,
    });
  }

  static toCreateData(entity: ExerciseEntity): ExerciseCreateData {
    return {
      id: entity.id,
      exerciseTemplateId: entity.exerciseTemplateId,
      targetLanguage: entity.targetLanguage,
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      content: entity.content as Prisma.InputJsonValue,
      expectedAnswers: entity.expectedAnswers as Prisma.InputJsonValue,
      answerCheckSettings: (entity.answerCheckSettings ?? Prisma.JsonNull) as
        | Prisma.InputJsonValue
        | Prisma.NullableJsonNullValueInput,
      ownerUserId: entity.ownerUserId,
      ownerSchoolId: entity.ownerSchoolId,
      visibility: domainVisibilityToPrisma(entity.visibility),
      estimatedDurationSeconds: entity.estimatedDurationSeconds,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toUpdateData(entity: ExerciseEntity): ExerciseUpdateData {
    return {
      difficultyLevel: domainDifficultyToPrisma(entity.difficultyLevel),
      content: entity.content as Prisma.InputJsonValue,
      expectedAnswers: entity.expectedAnswers as Prisma.InputJsonValue,
      answerCheckSettings: (entity.answerCheckSettings ?? Prisma.JsonNull) as
        | Prisma.InputJsonValue
        | Prisma.NullableJsonNullValueInput,
      visibility: domainVisibilityToPrisma(entity.visibility),
      estimatedDurationSeconds: entity.estimatedDurationSeconds,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
