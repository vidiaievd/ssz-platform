jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { NotFoundException } from '@nestjs/common';
import { Result } from '../../../../../shared/kernel/result.js';
import { GetGrammarAtomCatalogHandler } from './grammar-atom-catalog.handler.js';
import { GetGrammarAtomCatalogQuery } from './grammar-atom-catalog.query.js';

// Plan 85, step 2: the grammar atoms of a course, as a model is shown them.

const COURSE = 'course-1';

const coverageAtom = (atomType: string, atomId: string) => ({ atomType, atomId });

const explanation = (explanationLanguage: string, displayTitle: string) => ({
  explanationLanguage,
  minLevel: 'A2',
  displayTitle,
});

function makeHandler(options: { coverage?: unknown; cached?: unknown; atoms?: unknown[] } = {}) {
  const prisma = {
    grammarRuleAtom: { findMany: jest.fn().mockResolvedValue(options.atoms ?? []) },
  };
  const queryBus = {
    execute: jest.fn().mockResolvedValue(
      options.coverage ?? Result.ok({ available: true, atoms: [] }),
    ),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(options.cached ?? null),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const handler = new GetGrammarAtomCatalogHandler(prisma as any, queryBus as any, cache as any);
  return { handler, prisma, queryBus, cache };
}

describe('GetGrammarAtomCatalogHandler', () => {
  it('names grammar atoms only, with the rule title in the asked language', async () => {
    const { handler, prisma, cache } = makeHandler({
      coverage: Result.ok({
        available: true,
        atoms: [coverageAtom('grammar_rule_atom', 'atom-1'), coverageAtom('vocabulary_item', 'word-1')],
      }),
      atoms: [
        {
          id: 'atom-1',
          grammarRuleId: 'rule-1',
          title: 'Dobbel bestemthet',
          description: 'det store huset — the article and the ending both.\nSecond line never shown.',
          grammarRule: {
            title: 'Substantiv: bestemthet',
            explanations: [explanation('en', 'Definiteness'), explanation('ru', 'Определённость')],
          },
        },
      ],
    });

    const catalog = await handler.execute(new GetGrammarAtomCatalogQuery(COURSE, 'ru'));

    expect(prisma.grammarRuleAtom.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['atom-1'] },
      deletedAt: null,
    });
    expect(catalog).toEqual({
      courseId: COURSE,
      language: 'ru',
      atoms: [
        {
          atomId: 'atom-1',
          ruleId: 'rule-1',
          ruleTitle: 'Определённость',
          title: 'Dobbel bestemthet',
          description: 'det store huset — the article and the ending both.',
        },
      ],
    });
    expect(cache.set).toHaveBeenCalledWith(
      `content:grammar-atom-catalog:${COURSE}:ru`,
      catalog,
      600,
    );
  });

  it("falls back to the rule's own title and a null description", async () => {
    const { handler } = makeHandler({
      coverage: Result.ok({ available: true, atoms: [coverageAtom('grammar_rule_atom', 'atom-1')] }),
      atoms: [
        {
          id: 'atom-1',
          grammarRuleId: 'rule-1',
          title: 'Av-frasen',
          description: null,
          grammarRule: { title: 'Passiv', explanations: [] },
        },
      ],
    });

    const catalog = await handler.execute(new GetGrammarAtomCatalogQuery(COURSE, 'ru'));

    expect(catalog.atoms[0]).toMatchObject({ ruleTitle: 'Passiv', description: null });
  });

  it('answers from the cache without walking the course', async () => {
    const cached = { courseId: COURSE, language: 'ru', atoms: [] };
    const { handler, queryBus } = makeHandler({ cached });

    expect(await handler.execute(new GetGrammarAtomCatalogQuery(COURSE, 'ru'))).toBe(cached);
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  it('answers an empty catalogue for a course with no grammar atoms, without a read', async () => {
    const { handler, prisma } = makeHandler({
      coverage: Result.ok({ available: false, atoms: [] }),
    });

    const catalog = await handler.execute(new GetGrammarAtomCatalogQuery(COURSE, 'en'));

    expect(catalog.atoms).toEqual([]);
    expect(prisma.grammarRuleAtom.findMany).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown course, and caches nothing', async () => {
    const { handler, cache } = makeHandler({ coverage: Result.fail('CONTAINER_NOT_FOUND') });

    await expect(handler.execute(new GetGrammarAtomCatalogQuery('nope', 'en'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });
});
