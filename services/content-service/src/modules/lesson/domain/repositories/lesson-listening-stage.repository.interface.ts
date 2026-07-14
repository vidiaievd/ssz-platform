import { LessonListeningStageEntity } from '../entities/lesson-listening-stage.entity.js';

export const LESSON_LISTENING_STAGE_REPOSITORY = Symbol('LESSON_LISTENING_STAGE_REPOSITORY');

export interface ILessonListeningStageRepository {
  findByVariantId(variantId: string): Promise<LessonListeningStageEntity[]>;
  findByVariantAndPosition(
    variantId: string,
    position: number,
  ): Promise<LessonListeningStageEntity | null>;
  save(entity: LessonListeningStageEntity): Promise<LessonListeningStageEntity>;
}
