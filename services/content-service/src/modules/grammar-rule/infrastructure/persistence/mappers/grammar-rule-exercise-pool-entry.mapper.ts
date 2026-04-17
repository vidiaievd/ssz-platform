import type { GrammarRuleExercisePool } from '../../../../../../generated/prisma/client.js';
import { GrammarRuleExercisePoolEntry } from '../../../domain/entities/grammar-rule-exercise-pool-entry.entity.js';

export interface GrammarRuleExercisePoolCreateData {
  id: string;
  grammarRuleId: string;
  exerciseId: string;
  position: number;
  weight: number;
  addedAt: Date;
  addedByUserId: string;
}

export type GrammarRuleExercisePoolUpdateData = Partial<
  Pick<GrammarRuleExercisePoolCreateData, 'position' | 'weight'>
>;

export class GrammarRuleExercisePoolEntryMapper {
  static toDomain(raw: GrammarRuleExercisePool): GrammarRuleExercisePoolEntry {
    return GrammarRuleExercisePoolEntry.reconstitute(raw.id, {
      grammarRuleId: raw.grammarRuleId,
      exerciseId: raw.exerciseId,
      position: raw.position,
      weight: raw.weight,
      addedAt: raw.addedAt,
      addedByUserId: raw.addedByUserId,
    });
  }

  static toCreateData(entry: GrammarRuleExercisePoolEntry): GrammarRuleExercisePoolCreateData {
    return {
      id: entry.id,
      grammarRuleId: entry.grammarRuleId,
      exerciseId: entry.exerciseId,
      position: entry.position,
      weight: entry.weight,
      addedAt: entry.addedAt,
      addedByUserId: entry.addedByUserId,
    };
  }

  static toUpdateData(entry: GrammarRuleExercisePoolEntry): GrammarRuleExercisePoolUpdateData {
    return {
      position: entry.position,
      weight: entry.weight,
    };
  }
}
