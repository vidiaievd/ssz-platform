import { ExerciseTemplateEntity } from '../entities/exercise-template.entity.js';

export const EXERCISE_TEMPLATE_REPOSITORY = Symbol('EXERCISE_TEMPLATE_REPOSITORY');

export interface IExerciseTemplateRepository {
  /**
   * Returns all templates. Pass `onlyActive = true` to filter out inactive ones.
   * Default: returns all (including inactive) for admin visibility.
   */
  findAll(onlyActive?: boolean): Promise<ExerciseTemplateEntity[]>;

  /** Returns null if not found. */
  findByCode(code: string): Promise<ExerciseTemplateEntity | null>;

  /** Returns null if not found. */
  findById(id: string): Promise<ExerciseTemplateEntity | null>;
}
