import { LessonVideoCueEntity } from '../entities/lesson-video-cue.entity.js';

export const LESSON_VIDEO_CUE_REPOSITORY = Symbol('LESSON_VIDEO_CUE_REPOSITORY');

export interface ILessonVideoCueRepository {
  findByVariantId(variantId: string): Promise<LessonVideoCueEntity[]>;
  findByVariantAndPosition(
    variantId: string,
    position: number,
  ): Promise<LessonVideoCueEntity | null>;
  save(entity: LessonVideoCueEntity): Promise<LessonVideoCueEntity>;
}
