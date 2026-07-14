import type { LessonVideoCue } from '../../../../../../generated/prisma/client.js';
import { LessonVideoCueEntity } from '../../../domain/entities/lesson-video-cue.entity.js';

// Shape passed to prisma.lessonVideoCue.create({ data: ... })
export interface LessonVideoCueCreateData {
  id: string;
  lessonContentVariantId: string;
  position: number;
  startSeconds: number;
  targetLine: string;
  translationLine: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class LessonVideoCueMapper {
  static toDomain(raw: LessonVideoCue): LessonVideoCueEntity {
    return LessonVideoCueEntity.reconstitute(raw.id, {
      lessonContentVariantId: raw.lessonContentVariantId,
      position: raw.position,
      startSeconds: raw.startSeconds,
      targetLine: raw.targetLine,
      translationLine: raw.translationLine,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  static toCreateData(entity: LessonVideoCueEntity): LessonVideoCueCreateData {
    return {
      id: entity.id,
      lessonContentVariantId: entity.lessonContentVariantId,
      position: entity.position,
      startSeconds: entity.startSeconds,
      targetLine: entity.targetLine,
      translationLine: entity.translationLine,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
