import { LessonEntity } from '../entities/lesson.entity.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../container/domain/value-objects/visibility.vo.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';

export const LESSON_REPOSITORY = Symbol('LESSON_REPOSITORY');

export interface LessonFilter {
  targetLanguage?: string;
  difficultyLevel?: DifficultyLevel;
  visibility?: Visibility;
  ownerUserId?: string;
  ownerSchoolId?: string;
  search?: string;
  page: number;
  limit: number;
  sort?: string;
  includeDeleted?: boolean;
}

export interface ILessonRepository {
  findById(id: string): Promise<LessonEntity | null>;
  findBySlug(slug: string): Promise<LessonEntity | null>;
  findAll(filter: LessonFilter): Promise<PaginatedResult<LessonEntity>>;
  save(entity: LessonEntity): Promise<LessonEntity>;
  softDelete(id: string): Promise<void>;
  isSlugTaken(slug: string): Promise<boolean>;
  /**
   * Returns true if the lesson is referenced by any container_item
   * whose parent container_version has status IN ('published', 'deprecated').
   *
   * Cross-module read is intentional: Content Service owns a single database (content_db)
   * and querying across tables within the same service is acceptable here.
   * The alternative (a domain port IContentReferenceChecker) would be overkill for a single method.
   */
  hasPublishedContainerReferences(lessonId: string): Promise<boolean>;
  /**
   * Returns true if the lesson has at least one variant with status = 'published'.
   * Used by PublishVariantHandler to determine whether slug generation is needed.
   */
  hasAnyPublishedVariant(lessonId: string): Promise<boolean>;
}
