import type { LessonListeningStage } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { LessonListeningStageEntity } from '../../../domain/entities/lesson-listening-stage.entity.js';
import {
  prismaListeningStageTypeToDomain,
  domainListeningStageTypeToPrisma,
} from './enum-converters.js';

// Shape passed to prisma.lessonListeningStage.create({ data: ... })
export interface LessonListeningStageCreateData {
  id: string;
  lessonContentVariantId: string;
  exerciseId: string;
  position: number;
  stageType: $Enums.ListeningStageType;
  createdAt: Date;
}

export class LessonListeningStageMapper {
  static toDomain(raw: LessonListeningStage): LessonListeningStageEntity {
    return LessonListeningStageEntity.reconstitute(raw.id, {
      lessonContentVariantId: raw.lessonContentVariantId,
      exerciseId: raw.exerciseId,
      position: raw.position,
      stageType: prismaListeningStageTypeToDomain(raw.stageType),
      createdAt: raw.createdAt,
    });
  }

  static toCreateData(entity: LessonListeningStageEntity): LessonListeningStageCreateData {
    return {
      id: entity.id,
      lessonContentVariantId: entity.lessonContentVariantId,
      exerciseId: entity.exerciseId,
      position: entity.position,
      stageType: domainListeningStageTypeToPrisma(entity.stageType),
      createdAt: entity.createdAt,
    };
  }

  static toCreateManyData(
    entities: LessonListeningStageEntity[],
  ): LessonListeningStageCreateData[] {
    return entities.map((entity) => LessonListeningStageMapper.toCreateData(entity));
  }
}
