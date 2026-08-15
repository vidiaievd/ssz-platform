import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetExerciseRuleLinksQuery } from './get-exercise-rule-links.query.js';

/** One rule this exercise is practised by, with the entry's own numbers. */
export interface ExerciseRuleLink {
  ruleId: string;
  title: string;
  topic: string;
  subtopic: string | null;
  difficultyLevel: string;
  weight: number;
  position: number;
}

/**
 * The pool read backwards: every rule whose pool holds this exercise.
 *
 * A read model rather than a repository call, like the rest of the pool queries — and it
 * is a cheap one: `grammar_rule_exercise_pool` is indexed on `exercise_id`.
 */
@QueryHandler(GetExerciseRuleLinksQuery)
export class GetExerciseRuleLinksHandler
  implements IQueryHandler<GetExerciseRuleLinksQuery, ExerciseRuleLink[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetExerciseRuleLinksQuery): Promise<ExerciseRuleLink[]> {
    const rows = await this.prisma.grammarRuleExercisePool.findMany({
      where: { exerciseId: query.exerciseId, grammarRule: { deletedAt: null } },
      orderBy: { addedAt: 'asc' },
      include: {
        grammarRule: {
          select: {
            id: true,
            title: true,
            topic: true,
            subtopic: true,
            difficultyLevel: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      ruleId: row.grammarRule.id,
      title: row.grammarRule.title,
      topic: row.grammarRule.topic,
      subtopic: row.grammarRule.subtopic,
      difficultyLevel: row.grammarRule.difficultyLevel,
      weight: row.weight,
      position: row.position,
    }));
  }
}
