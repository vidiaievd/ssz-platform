import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IGrammarRuleExercisePoolRepository,
  PoolEntryWithExercise,
  GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY,
} from '../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import { GrammarRuleExercisePoolEntry } from '../../domain/entities/grammar-rule-exercise-pool-entry.entity.js';
import { GrammarRuleExercisePoolEntryMapper } from './mappers/grammar-rule-exercise-pool-entry.mapper.js';
import { ExerciseMapper } from '../../../exercise/infrastructure/persistence/mappers/exercise.mapper.js';

export { GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY };

const EXERCISE_WITH_TEMPLATE = {
  exercise: { include: { template: { select: { code: true } } } },
} as const;

@Injectable()
export class PrismaGrammarRuleExercisePoolRepository implements IGrammarRuleExercisePoolRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByRuleId(ruleId: string): Promise<GrammarRuleExercisePoolEntry[]> {
    const rows = await this.prisma.grammarRuleExercisePool.findMany({
      where: { grammarRuleId: ruleId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => GrammarRuleExercisePoolEntryMapper.toDomain(row));
  }

  async findByRuleIdWithExercises(ruleId: string): Promise<PoolEntryWithExercise[]> {
    const rows = await this.prisma.grammarRuleExercisePool.findMany({
      where: {
        grammarRuleId: ruleId,
        exercise: { deletedAt: null },
      },
      orderBy: { position: 'asc' },
      include: EXERCISE_WITH_TEMPLATE,
    });

    return rows.map((row) => ({
      entry: GrammarRuleExercisePoolEntryMapper.toDomain(row),
      exercise: ExerciseMapper.toDomain(row.exercise),
    }));
  }

  async findEntry(
    ruleId: string,
    exerciseId: string,
  ): Promise<GrammarRuleExercisePoolEntry | null> {
    const raw = await this.prisma.grammarRuleExercisePool.findUnique({
      where: { grammarRuleId_exerciseId: { grammarRuleId: ruleId, exerciseId } },
    });
    return raw ? GrammarRuleExercisePoolEntryMapper.toDomain(raw) : null;
  }

  async save(entry: GrammarRuleExercisePoolEntry): Promise<GrammarRuleExercisePoolEntry> {
    const exists = await this.prisma.grammarRuleExercisePool.findUnique({
      where: {
        grammarRuleId_exerciseId: {
          grammarRuleId: entry.grammarRuleId,
          exerciseId: entry.exerciseId,
        },
      },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.grammarRuleExercisePool.update({
          where: { id: exists.id },
          data: GrammarRuleExercisePoolEntryMapper.toUpdateData(entry),
        })
      : await this.prisma.grammarRuleExercisePool.create({
          data: GrammarRuleExercisePoolEntryMapper.toCreateData(entry),
        });

    return GrammarRuleExercisePoolEntryMapper.toDomain(raw);
  }

  async delete(ruleId: string, exerciseId: string): Promise<void> {
    await this.prisma.grammarRuleExercisePool.delete({
      where: { grammarRuleId_exerciseId: { grammarRuleId: ruleId, exerciseId } },
    });
  }

  async getMaxPosition(ruleId: string): Promise<number> {
    const result = await this.prisma.grammarRuleExercisePool.aggregate({
      where: { grammarRuleId: ruleId },
      _max: { position: true },
    });
    return result._max.position ?? 0;
  }

  /**
   * Two-pass reorder to avoid unique(grammarRuleId, position) violations when
   * entries swap positions mid-transaction (same strategy as vocabulary item reorder).
   */
  async reorder(
    ruleId: string,
    items: Array<{ exerciseId: string; position: number }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.grammarRuleExercisePool.update({
          where: {
            grammarRuleId_exerciseId: { grammarRuleId: ruleId, exerciseId: item.exerciseId },
          },
          data: { position: item.position + 10000 },
        });
      }
      for (const item of items) {
        await tx.grammarRuleExercisePool.update({
          where: {
            grammarRuleId_exerciseId: { grammarRuleId: ruleId, exerciseId: item.exerciseId },
          },
          data: { position: item.position },
        });
      }
    });
  }
}
