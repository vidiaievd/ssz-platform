import { LessonListeningStageEntity } from '../entities/lesson-listening-stage.entity.js';

export const LESSON_LISTENING_STAGE_REPOSITORY = Symbol('LESSON_LISTENING_STAGE_REPOSITORY');

export interface ILessonListeningStageRepository {
  findByVariantId(variantId: string): Promise<LessonListeningStageEntity[]>;
  /**
   * Atomically replaces all staged exercises for a variant.
   * Runs delete + createMany in a single transaction, mirroring
   * ILessonVideoCueRepository.replaceForVariant.
   */
  replaceForVariant(variantId: string, stages: LessonListeningStageEntity[]): Promise<void>;
}
