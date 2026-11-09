import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';

describe('NotificationsRepository.eraseUser', () => {
  const deleteMany = (count: number) => jest.fn().mockReturnValue({ count });
  const prisma = {
    notification: { deleteMany: deleteMany(4) },
    reviewDigestState: { deleteMany: deleteMany(1) },
    lessonReminder: { deleteMany: deleteMany(2) },
    reviewTermWarning: { deleteMany: deleteMany(0) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const repo = new NotificationsRepository(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('drops the feed by recipient or address, and every job row of the user, in one transaction', async () => {
    expect(await repo.eraseUser('u1', 'Gone@Example.com')).toEqual({ notifications: 4 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ recipientId: 'u1' }, { recipientEmail: { equals: 'Gone@Example.com', mode: 'insensitive' } }] },
    });
    for (const table of [prisma.reviewDigestState, prisma.lessonReminder, prisma.reviewTermWarning]) {
      expect(table.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    }
  });

  it('matches by recipient only without an address', async () => {
    await repo.eraseUser('u1', null);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { recipientId: 'u1' } });
  });
});
