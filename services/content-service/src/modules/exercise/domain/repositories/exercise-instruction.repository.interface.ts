import { ExerciseInstructionEntity } from '../entities/exercise-instruction.entity.js';

export const EXERCISE_INSTRUCTION_REPOSITORY = Symbol('EXERCISE_INSTRUCTION_REPOSITORY');

export interface IExerciseInstructionRepository {
  findById(id: string): Promise<ExerciseInstructionEntity | null>;

  findByExerciseId(exerciseId: string): Promise<ExerciseInstructionEntity[]>;

  findByExerciseAndLanguage(
    exerciseId: string,
    instructionLanguage: string,
  ): Promise<ExerciseInstructionEntity | null>;

  /**
   * Upserts by (exerciseId, instructionLanguage).
   * Returns the saved entity and whether a new row was created.
   */
  upsert(
    entity: ExerciseInstructionEntity,
  ): Promise<{ entity: ExerciseInstructionEntity; wasCreated: boolean }>;

  delete(id: string): Promise<void>;
}
