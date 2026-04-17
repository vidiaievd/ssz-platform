import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../container/domain/value-objects/visibility.vo.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { ExerciseEntity } from '../entities/exercise.entity.js';

export const EXERCISE_REPOSITORY = Symbol('EXERCISE_REPOSITORY');

export interface ExerciseFilter {
  targetLanguage?: string;
  difficultyLevel?: DifficultyLevel;
  visibility?: Visibility;
  exerciseTemplateId?: string;
  ownerUserId?: string;
  ownerSchoolId?: string;
  // search is reserved for future full-text; currently unused in DB query.
  search?: string;
  page: number;
  limit: number;
  sort?: string;
  includeDeleted?: boolean;
}

export interface IExerciseRepository {
  /** Returns null if not found. Pass includeInstructions = true to load the instructions relation. */
  findById(id: string, includeInstructions?: boolean): Promise<ExerciseEntity | null>;

  findAll(filter: ExerciseFilter): Promise<PaginatedResult<ExerciseEntity>>;

  /** Upserts the entity and publishes its domain events. */
  save(entity: ExerciseEntity): Promise<ExerciseEntity>;

  softDelete(id: string): Promise<void>;

  /**
   * Returns true if any container_item row references this exercise with a
   * version whose status is 'published' or 'deprecated'.
   * Used to block hard-delete / soft-delete when the exercise is in active content.
   */
  hasPublishedContainerReferences(exerciseId: string): Promise<boolean>;
}
