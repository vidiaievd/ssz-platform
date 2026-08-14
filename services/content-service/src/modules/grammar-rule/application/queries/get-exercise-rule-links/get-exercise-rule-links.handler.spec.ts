// Prevent Jest from loading the generated Prisma client (uses import.meta which
// breaks CommonJS transform). The handler receives PrismaService via injection.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetExerciseRuleLinksHandler } from './get-exercise-rule-links.handler.js';
import { GetExerciseRuleLinksQuery } from './get-exercise-rule-links.query.js';
import type { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

function makeHandler(rows: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = { grammarRuleExercisePool: { findMany } } as unknown as PrismaService;
  return { handler: new GetExerciseRuleLinksHandler(prisma), findMany };
}

const row = {
  weight: 2,
  position: 1,
  grammarRule: {
    id: 'rule-1',
    title: 'Perfektum',
    topic: 'VERBS',
    subtopic: 'Presens perfektum',
    difficultyLevel: 'B1',
  },
};

describe('GetExerciseRuleLinksHandler', () => {
  it('reads the pool by exercise, which is the indexed side of the row', async () => {
    const { handler, findMany } = makeHandler([]);

    await handler.execute(new GetExerciseRuleLinksQuery('ex-1'));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { exerciseId: 'ex-1', grammarRule: { deletedAt: null } },
      }),
    );
  });

  it('carries the entry’s own weight, not only the rule it points at', async () => {
    const { handler } = makeHandler([row]);

    const links = await handler.execute(new GetExerciseRuleLinksQuery('ex-1'));

    expect(links).toEqual([
      {
        ruleId: 'rule-1',
        title: 'Perfektum',
        topic: 'VERBS',
        subtopic: 'Presens perfektum',
        difficultyLevel: 'B1',
        weight: 2,
        position: 1,
      },
    ]);
  });
});
