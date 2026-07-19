import type { LessonVideoQuestion } from '../../../../../../generated/prisma/client.js';
import { LessonVideoQuestionEntity } from '../../../domain/entities/lesson-video-question.entity.js';

// Shape passed to prisma.lessonVideoQuestion.upsert({ create/update: ... })
export interface LessonVideoQuestionUpsertData {
  id: string;
  lessonContentVariantId: string;
  exerciseId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class LessonVideoQuestionMapper {
  static toDomain(raw: LessonVideoQuestion): LessonVideoQuestionEntity {
    return LessonVideoQuestionEntity.reconstitute(raw.id, {
      lessonContentVariantId: raw.lessonContentVariantId,
      exerciseId: raw.exerciseId,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  static toUpsertData(entity: LessonVideoQuestionEntity): LessonVideoQuestionUpsertData {
    return {
      id: entity.id,
      lessonContentVariantId: entity.lessonContentVariantId,
      exerciseId: entity.exerciseId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
