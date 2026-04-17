import { ExerciseEntity } from '../../../exercise/domain/entities/exercise.entity.js';
import { GrammarRuleExercisePoolEntry } from '../entities/grammar-rule-exercise-pool-entry.entity.js';

export const GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY = Symbol(
  'GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY',
);

export interface PoolEntryWithExercise {
  entry: GrammarRuleExercisePoolEntry;
  exercise: ExerciseEntity;
}

export interface IGrammarRuleExercisePoolRepository {
  /** Returns all pool entries for a rule, ordered by position. */
  findByRuleId(ruleId: string): Promise<GrammarRuleExercisePoolEntry[]>;

  /**
   * Returns pool entries joined with their exercises.
   * Only includes entries where exercise.deletedAt IS NULL.
   */
  findByRuleIdWithExercises(ruleId: string): Promise<PoolEntryWithExercise[]>;

  findEntry(ruleId: string, exerciseId: string): Promise<GrammarRuleExercisePoolEntry | null>;

  save(entry: GrammarRuleExercisePoolEntry): Promise<GrammarRuleExercisePoolEntry>;

  /** Hard-deletes the pool entry row. */
  delete(ruleId: string, exerciseId: string): Promise<void>;

  /** Returns the highest current position value for a rule's pool (0 if empty). */
  getMaxPosition(ruleId: string): Promise<number>;

  /**
   * Updates positions for the given entries in a single transaction.
   * Uses a temporary offset to avoid unique constraint violations mid-reorder
   * (same strategy as vocabulary items reorder).
   */
  reorder(ruleId: string, items: Array<{ exerciseId: string; position: number }>): Promise<void>;
}
