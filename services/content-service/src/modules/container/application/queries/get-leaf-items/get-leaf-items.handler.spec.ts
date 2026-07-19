// Prevent Jest from loading the generated Prisma client (uses import.meta which
// breaks CommonJS transform). The handler receives PrismaService via constructor
// injection so the module itself is never called in these unit tests.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetLeafItemsHandler } from './get-leaf-items.handler.js';
import { GetLeafItemsQuery } from './get-leaf-items.query.js';

const COURSE_ID = 'course-1';
const COURSE_VERSION = 'course-v1';
const MODULE_A = 'module-a';
const MODULE_A_VERSION = 'module-a-v1';
const MODULE_B = 'module-b';
const MODULE_B_VERSION = 'module-b-v1';

interface ContainerRow {
  currentPublishedVersionId: string | null;
}
interface ItemRow {
  itemType: string;
  itemId: string;
  isRequired: boolean;
}

/**
 * Fixture: COURSE → [MODULE_A → (lesson req, exercise optional)], [MODULE_B → (vocab req)].
 */
function makePrisma() {
  const containersByVersion: Record<string, string> = {
    [COURSE_ID]: COURSE_VERSION,
    [MODULE_A]: MODULE_A_VERSION,
    [MODULE_B]: MODULE_B_VERSION,
  };
  const itemsByVersion: Record<string, ItemRow[]> = {
    [COURSE_VERSION]: [
      { itemType: 'CONTAINER', itemId: MODULE_A, isRequired: true },
      { itemType: 'CONTAINER', itemId: MODULE_B, isRequired: true },
    ],
    [MODULE_A_VERSION]: [
      { itemType: 'LESSON', itemId: 'lesson-1', isRequired: true },
      { itemType: 'EXERCISE', itemId: 'exercise-1', isRequired: false },
    ],
    [MODULE_B_VERSION]: [{ itemType: 'VOCABULARY_LIST', itemId: 'vocab-1', isRequired: true }],
  };

  return {
    container: {
      findUnique: jest.fn(
        ({ where }: { where: { id: string } }): Promise<ContainerRow | null> =>
          Promise.resolve(
            containersByVersion[where.id]
              ? { currentPublishedVersionId: containersByVersion[where.id] }
              : null,
          ),
      ),
    },
    containerItem: {
      findMany: jest.fn(
        ({ where }: { where: { containerVersionId: string } }): Promise<ItemRow[]> =>
          Promise.resolve(itemsByVersion[where.containerVersionId] ?? []),
      ),
    },
  };
}

function makeHandler(prisma: ReturnType<typeof makePrisma>): GetLeafItemsHandler {
  return new GetLeafItemsHandler(prisma as never);
}

describe('GetLeafItemsHandler', () => {
  it('attributes each leaf to its top-level module and carries isRequired', async () => {
    const handler = makeHandler(makePrisma());

    const result = await handler.execute(new GetLeafItemsQuery(COURSE_ID));

    expect(result).toEqual(
      expect.arrayContaining([
        { itemType: 'LESSON', itemId: 'lesson-1', moduleId: MODULE_A, isRequired: true },
        { itemType: 'EXERCISE', itemId: 'exercise-1', moduleId: MODULE_A, isRequired: false },
        { itemType: 'VOCABULARY_LIST', itemId: 'vocab-1', moduleId: MODULE_B, isRequired: true },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it('returns an empty array for a course with no published version', async () => {
    const prisma = makePrisma();
    prisma.container.findUnique.mockResolvedValueOnce(null);
    const handler = makeHandler(prisma);

    const result = await handler.execute(new GetLeafItemsQuery(COURSE_ID));

    expect(result).toEqual([]);
  });
});
