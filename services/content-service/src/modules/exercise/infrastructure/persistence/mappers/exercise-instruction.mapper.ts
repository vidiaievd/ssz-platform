import type { ExerciseInstruction } from '../../../../../../generated/prisma/client.js';
import { Prisma } from '../../../../../../generated/prisma/client.js';
import { ExerciseInstructionEntity } from '../../../domain/entities/exercise-instruction.entity.js';

export interface ExerciseInstructionCreateData {
  id: string;
  exerciseId: string;
  instructionLanguage: string;
  instructionText: string;
  hintText: string | null;
  textOverrides: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  draftInstructionText: string | null;
  draftHintText: string | null;
  draftTextOverrides: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  draftUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ExerciseInstructionUpdateData = Partial<
  Omit<ExerciseInstructionCreateData, 'id' | 'exerciseId' | 'createdAt'>
>;

export class ExerciseInstructionMapper {
  static toDomain(raw: ExerciseInstruction): ExerciseInstructionEntity {
    return ExerciseInstructionEntity.reconstitute(raw.id, {
      exerciseId: raw.exerciseId,
      instructionLanguage: raw.instructionLanguage,
      instructionText: raw.instructionText,
      hintText: raw.hintText,
      textOverrides: raw.textOverrides as Record<string, unknown> | null,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      draft:
        raw.draftUpdatedAt === null
          ? null
          : {
              instructionText: raw.draftInstructionText ?? raw.instructionText,
              hintText: raw.draftHintText,
              textOverrides: raw.draftTextOverrides as Record<string, unknown> | null,
              updatedAt: raw.draftUpdatedAt,
            },
    });
  }

  static toCreateData(entity: ExerciseInstructionEntity): ExerciseInstructionCreateData {
    return {
      id: entity.id,
      exerciseId: entity.exerciseId,
      instructionLanguage: entity.instructionLanguage,
      instructionText: entity.instructionText,
      hintText: entity.hintText,
      textOverrides: (entity.textOverrides ?? Prisma.JsonNull) as
        | Prisma.InputJsonValue
        | Prisma.NullableJsonNullValueInput,
      draftInstructionText: entity.draft?.instructionText ?? null,
      draftHintText: entity.draft?.hintText ?? null,
      draftTextOverrides: (entity.draft?.textOverrides ?? Prisma.JsonNull) as
        | Prisma.InputJsonValue
        | Prisma.NullableJsonNullValueInput,
      draftUpdatedAt: entity.draft?.updatedAt ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toUpdateData(entity: ExerciseInstructionEntity): ExerciseInstructionUpdateData {
    return {
      instructionText: entity.instructionText,
      hintText: entity.hintText,
      textOverrides: (entity.textOverrides ?? Prisma.JsonNull) as
        | Prisma.InputJsonValue
        | Prisma.NullableJsonNullValueInput,
      draftInstructionText: entity.draft?.instructionText ?? null,
      draftHintText: entity.draft?.hintText ?? null,
      draftTextOverrides: (entity.draft?.textOverrides ?? Prisma.JsonNull) as
        | Prisma.InputJsonValue
        | Prisma.NullableJsonNullValueInput,
      draftUpdatedAt: entity.draft?.updatedAt ?? null,
      updatedAt: entity.updatedAt,
    };
  }
}
