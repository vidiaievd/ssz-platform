jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { PrismaContainerItemMover } from './prisma-container-item-mover.js';

const ROW = {
  id: 'row-1',
  containerVersionId: 'version-17b',
  position: 3,
  itemType: 'EXERCISE',
  itemId: 'exercise-1',
  isRequired: false,
  sectionId: 'section-17b',
  sectionLabel: 'legacy label',
  xpReward: 5,
};

const INPUT = {
  sourceVersionId: 'version-17b',
  rowId: 'row-1',
  targetVersionId: 'version-17c',
  targetSectionId: 'section-17c',
};

function makeMover(opts?: { row?: unknown; maxPosition?: number | null }) {
  const calls: string[] = [];
  const tx = {
    containerItem: {
      findFirst: jest.fn().mockResolvedValue(opts && 'row' in opts ? opts.row : ROW),
      delete: jest.fn(() => {
        calls.push('delete');
      }),
      aggregate: jest.fn().mockResolvedValue({
        _max: { position: opts && 'maxPosition' in opts ? opts.maxPosition : 8 },
      }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        calls.push('create');
        return { id: 'row-moved', ...data };
      }),
    },
    containerVersion: {
      updateMany: jest.fn(() => {
        calls.push('revision');
      }),
    },
  };
  const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
  return { mover: new PrismaContainerItemMover(prisma as any), tx, calls };
}

describe('PrismaContainerItemMover', () => {
  it('takes the row out of the source and places the material last in the target', async () => {
    const { mover, tx, calls } = makeMover();

    const moved = await mover.moveRow(INPUT);

    expect(moved).toEqual({ rowId: 'row-moved', position: 9 });
    expect(calls).toEqual(['delete', 'create', 'revision']);
    expect(tx.containerItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'row-1', containerVersionId: 'version-17b' },
    });
    expect(tx.containerItem.aggregate).toHaveBeenCalledWith({
      where: { containerVersionId: 'version-17c' },
      _max: { position: true },
    });
    // The same material with the row's flags; the legacy label belongs to the old section.
    expect(tx.containerItem.create.mock.calls[0][0].data).toEqual({
      containerVersionId: 'version-17c',
      position: 9,
      itemType: 'EXERCISE',
      itemId: 'exercise-1',
      isRequired: false,
      sectionId: 'section-17c',
      xpReward: 5,
    });
  });

  it('bumps the revision of both drafts', async () => {
    const { mover, tx } = makeMover();

    await mover.moveRow(INPUT);

    expect(tx.containerVersion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['version-17b', 'version-17c'] } },
      data: { revisionCount: { increment: 1 } },
    });
  });

  it('starts an empty target at position 0', async () => {
    const { mover } = makeMover({ maxPosition: null });
    expect((await mover.moveRow(INPUT))?.position).toBe(0);
  });

  it('moves nothing when the row is no longer in the source', async () => {
    const { mover, tx } = makeMover({ row: null });

    expect(await mover.moveRow(INPUT)).toBeNull();
    expect(tx.containerItem.delete).not.toHaveBeenCalled();
    expect(tx.containerItem.create).not.toHaveBeenCalled();
  });
});
