import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';

// VoxOrd plan 06, step 6e: the feed pages by (createdAt, id), the order it is in.
describe('NotificationsRepository.listInApp', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const findFirst = jest.fn();
  const repo = new NotificationsRepository({ notification: { findMany, findFirst } } as never);

  beforeEach(() => {
    findMany.mockClear();
    findFirst.mockReset();
  });

  it('orders by time, then id, so rows of the same instant keep a stable place', async () => {
    await repo.listInApp({ recipientId: 'learner-1', limit: 51 });

    const query = findMany.mock.calls[0][0];
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(query.where).not.toHaveProperty('OR');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('reads the page after the cursor row by its time, not by comparing ids', async () => {
    const at = new Date('2026-10-29T12:00:00.000Z');
    findFirst.mockResolvedValue({ id: 'n-50', createdAt: at });

    await repo.listInApp({ recipientId: 'learner-1', cursor: 'n-50', limit: 51 });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'n-50', recipientId: 'learner-1' },
      select: { id: true, createdAt: true },
    });
    const { where } = findMany.mock.calls[0][0];
    expect(where.OR).toEqual([{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'n-50' } }]);
    expect(where).not.toHaveProperty('id');
  });

  it('ends the feed on a cursor that is not one of the reader’s rows', async () => {
    findFirst.mockResolvedValue(null);

    await expect(repo.listInApp({ recipientId: 'learner-1', cursor: 'gone', limit: 51 })).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
