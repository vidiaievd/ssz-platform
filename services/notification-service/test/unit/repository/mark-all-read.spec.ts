import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';

describe('NotificationsRepository.markAllRead', () => {
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const repo = new NotificationsRepository({ notification: { updateMany } } as never);

  beforeEach(() => updateMany.mockClear());

  it('reads everything unread in the feed when no instant is given', async () => {
    await repo.markAllRead('learner-1');

    const { where } = updateMany.mock.calls[0][0];
    expect(where).toEqual({ recipientId: 'learner-1', channel: 'IN_APP', isRead: false, archivedAt: null });
  });

  // VoxOrd plan 06, step 6d: «read all» is about what the reader saw, not what arrived since.
  it('leaves what arrived after `before` unread', async () => {
    const before = new Date('2026-10-29T17:30:00.000Z');

    await repo.markAllRead('learner-1', before);

    expect(updateMany.mock.calls[0][0].where).toMatchObject({ createdAt: { lte: before } });
  });
});
