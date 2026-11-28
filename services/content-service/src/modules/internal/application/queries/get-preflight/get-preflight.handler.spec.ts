// The generated Prisma client does not load under jest; the handler only needs the token.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetPreflightHandler } from './get-preflight.handler.js';
import { GetPreflightQuery } from './get-preflight.query.js';

// A course keeps its material in modules (OQ-6). The version report checks two things of
// that shape: material on the course itself blocks publication, and the course-wide
// counts (grammar rules, exercises) take what the modules hold.

const COURSE_VERSION = 'course-v1';
const MODULE_ID = 'module-1';
const MODULE_DRAFT = 'module-1-draft';

type Item = { id: string; itemType: string; itemId: string; sectionId: string | null };

function makeHandler(courseItems: Item[], moduleCounts: Array<{ itemType: string; n: number }>) {
  const model = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  });
  const prisma: Record<string, ReturnType<typeof model> & Record<string, jest.Mock>> = {
    containerVersion: {
      ...model(),
      findUnique: jest.fn().mockResolvedValue({
        id: COURSE_VERSION,
        containerId: 'course-1',
        container: { containerType: 'COURSE', levelSystem: 'SINGLE', ownerSchoolId: null },
      }),
      findMany: jest.fn().mockResolvedValue([{ id: MODULE_DRAFT, containerId: MODULE_ID }]),
    },
    containerItem: {
      ...model(),
      findMany: jest.fn().mockResolvedValue(courseItems),
      groupBy: jest.fn().mockResolvedValue(
        moduleCounts.map((c) => ({
          containerVersionId: MODULE_DRAFT,
          itemType: c.itemType,
          _count: { id: c.n },
        })),
      ),
    },
    container: {
      ...model(),
      findMany: jest.fn().mockResolvedValue([{ id: MODULE_ID, currentPublishedVersionId: null }]),
    },
  };
  const prismaProxy = new Proxy(prisma, {
    get: (target, name: string) => (target[name] ??= model()),
  });
  return new GetPreflightHandler(
    prismaProxy as never,
    { getCourseTeachers: jest.fn().mockResolvedValue([]) } as never,
    { guideFor: jest.fn() } as never,
  );
}

const moduleItem: Item = { id: 'ci-1', itemType: 'CONTAINER', itemId: MODULE_ID, sectionId: null };

describe('GetPreflightHandler — a course built from modules', () => {
  it('blocks material placed on the course outside a module', async () => {
    const handler = makeHandler(
      [moduleItem, { id: 'ci-2', itemType: 'LESSON', itemId: 'lesson-1', sectionId: null }],
      [{ itemType: 'EXERCISE', n: 4 }],
    );
    const result = await handler.execute(new GetPreflightQuery(COURSE_VERSION));

    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'ITEM_OUTSIDE_MODULE',
          itemType: 'LESSON',
          itemId: 'lesson-1',
        }),
      ]),
    );
  });

  it('counts grammar rules and exercises inside the modules', async () => {
    const handler = makeHandler(
      [moduleItem],
      [
        { itemType: 'GRAMMAR_RULE', n: 1 },
        { itemType: 'EXERCISE', n: 4 },
        { itemType: 'LESSON', n: 1 },
      ],
    );
    const result = await handler.execute(new GetPreflightQuery(COURSE_VERSION));

    expect(result.blockers).toEqual([]);
    const warnings = result.warnings.map((w) => w.ruleCode);
    expect(warnings).not.toContain('NO_GRAMMAR');
    expect(warnings).not.toContain('EXERCISE_COUNT_LOW');
  });

  it('still warns when the modules hold too few exercises and no rule', async () => {
    const handler = makeHandler([moduleItem], [{ itemType: 'EXERCISE', n: 2 }]);
    const result = await handler.execute(new GetPreflightQuery(COURSE_VERSION));

    const warnings = result.warnings.map((w) => w.ruleCode);
    expect(warnings).toContain('NO_GRAMMAR');
    expect(warnings).toContain('EXERCISE_COUNT_LOW');
    expect(result.warnings.find((w) => w.ruleCode === 'EXERCISE_COUNT_LOW')?.detail).toMatch(
      /has 2 exercises/,
    );
  });
});
