import { LessonVariantMediaRefEntity } from '../entities/lesson-variant-media-ref.entity.js';
import { MediaRefType } from '../value-objects/media-ref-type.vo.js';

export const LESSON_VARIANT_MEDIA_REF_REPOSITORY = Symbol('LESSON_VARIANT_MEDIA_REF_REPOSITORY');

export interface IMediaRefRow {
  mediaId: string;
  mediaType: MediaRefType;
  positionInText: number;
}

export interface ILessonVariantMediaRefRepository {
  findByVariantId(variantId: string): Promise<LessonVariantMediaRefEntity[]>;
  /**
   * Atomically replaces all media refs for a variant.
   * Runs delete + createMany in a single transaction.
   * Called on every create/update of a variant's bodyMarkdown.
   */
  replaceForVariant(variantId: string, refs: IMediaRefRow[]): Promise<void>;
  deleteByVariantId(variantId: string): Promise<void>;
}
