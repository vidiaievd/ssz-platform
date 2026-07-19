import { LessonVideoCueEntity } from '../entities/lesson-video-cue.entity.js';

export const LESSON_VIDEO_CUE_REPOSITORY = Symbol('LESSON_VIDEO_CUE_REPOSITORY');

export interface ILessonVideoCueRepository {
  findByVariantId(variantId: string): Promise<LessonVideoCueEntity[]>;
  /**
   * Atomically replaces all cues for a variant.
   * Runs delete + createMany in a single transaction, mirroring
   * ILessonParagraphTranslationRepository.replaceForVariant.
   */
  replaceForVariant(variantId: string, cues: LessonVideoCueEntity[]): Promise<void>;
}
