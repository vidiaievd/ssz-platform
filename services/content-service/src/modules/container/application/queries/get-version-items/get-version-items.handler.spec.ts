// Keep Jest away from the generated Prisma client; the handler gets PrismaService injected.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetVersionItemsHandler } from './get-version-items.handler.js';
import { GetVersionItemsQuery } from './get-version-items.query.js';
import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';

function item(itemId: string, itemType: ContainerItemType) {
  return { itemId, itemType } as any;
}

function makeHandler(items: any[]) {
  const versionRepo = { findById: jest.fn().mockResolvedValue({ id: 'v1' }) } as any;
  const itemRepo = { findByVersionId: jest.fn().mockResolvedValue(items) } as any;
  const prisma = {
    lesson: { findMany: jest.fn().mockResolvedValue([{ id: 'lesson-1', title: 'Hassan' }]) },
    container: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'unit-1', title: '17B', learningGoals: ['Tell a doctor where it hurts'] },
        { id: 'unit-2', title: '17C', learningGoals: [] },
      ]),
    },
  } as any;
  return { handler: new GetVersionItemsHandler(versionRepo, itemRepo, prisma), prisma };
}

describe('GetVersionItemsHandler', () => {
  it('returns the units’ learning goals beside their titles', async () => {
    const { handler, prisma } = makeHandler([
      item('unit-1', ContainerItemType.CONTAINER),
      item('unit-2', ContainerItemType.CONTAINER),
      item('lesson-1', ContainerItemType.LESSON),
    ]);

    const result = await handler.execute(new GetVersionItemsQuery('v1'));

    expect(result.isOk).toBe(true);
    const { titles, learningGoals } = result.value;
    expect(titles.get('unit-1')).toBe('17B');
    expect(titles.get('lesson-1')).toBe('Hassan');
    expect(learningGoals.get('unit-1')).toEqual(['Tell a doctor where it hurts']);
    expect(learningGoals.get('unit-2')).toEqual([]);
    expect(learningGoals.has('lesson-1')).toBe(false);
    // One read of the units for both titles and goals.
    expect(prisma.container.findMany).toHaveBeenCalledTimes(1);
  });
});
