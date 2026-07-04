import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetPoolExerciseIdsQuery } from './get-pool-exercise-ids.query.js';

// Lightweight projection for grammar-rule mastery derivation (plan 21 §2.2):
// learning-service rates the rule's mastery off the retrievability of these
// exercises' own SRS cards — no GRAMMAR_RULE card type exists.
@QueryHandler(GetPoolExerciseIdsQuery)
export class GetPoolExerciseIdsHandler implements IQueryHandler<GetPoolExerciseIdsQuery, string[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetPoolExerciseIdsQuery): Promise<string[]> {
    const rows = await this.prisma.grammarRuleExercisePool.findMany({
      where: { grammarRuleId: query.ruleId, exercise: { deletedAt: null } },
      select: { exerciseId: true },
    });
    return rows.map((r) => r.exerciseId);
  }
}
