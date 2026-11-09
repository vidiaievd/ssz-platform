import { jest } from '@jest/globals';
import { DeletedUserPrismaEraser } from '../../../../src/modules/user-erasure/infrastructure/persistence/deleted-user.prisma.eraser.js';

const del = (count: number) => jest.fn<(args: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count });

function setup(counts = { enrollment: 2, assignment: 3, userProgress: 40, srsReviewCard: 120, canDoProgress: 5 }) {
  const tx = {
    enrollment: { deleteMany: del(counts.enrollment) },
    assignment: { deleteMany: del(counts.assignment) },
    userProgress: { deleteMany: del(counts.userProgress) },
    srsReviewCard: { deleteMany: del(counts.srsReviewCard) },
    canDoProgress: { deleteMany: del(counts.canDoProgress) },
  };
  const prisma = { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { tx, eraser: new DeletedUserPrismaEraser(prisma as never) };
}

describe('DeletedUserPrismaEraser', () => {
  it('deletes every row keyed by the learner, in one transaction', async () => {
    const { tx, eraser } = setup();

    const erased = await eraser.erase('u1');

    expect(erased).toEqual({ enrollments: 2, assignments: 3, progress: 40, srsCards: 120, canDo: 5 });
    // No deletedAt filter: soft-deleted rows go too.
    expect(tx.enrollment.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(tx.assignment.deleteMany).toHaveBeenCalledWith({ where: { assigneeId: 'u1' } });
    expect(tx.userProgress.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(tx.srsReviewCard.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(tx.canDoProgress.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('reports zeros on a replay', async () => {
    const { eraser } = setup({ enrollment: 0, assignment: 0, userProgress: 0, srsReviewCard: 0, canDoProgress: 0 });

    expect(await eraser.erase('u1')).toEqual({ enrollments: 0, assignments: 0, progress: 0, srsCards: 0, canDo: 0 });
  });
});
