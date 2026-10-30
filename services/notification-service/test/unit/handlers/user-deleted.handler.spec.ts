import { UserDeletedHandler } from '../../../src/modules/notifications/handlers/user-deleted.handler.js';
import { AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const meta: MessageMeta = {
  eventId: 'evt-del',
  eventType: 'IDomainEvent',
  occurredAt: new Date().toISOString(),
  source: 'auth-service',
};

describe('UserDeletedHandler', () => {
  const eraseUser = jest.fn().mockResolvedValue({ notifications: 3 });
  const handler = new UserDeletedHandler({ eraseUser } as never);

  beforeEach(() => eraseUser.mockClear());

  it('listens to auth.user.deleted', () => {
    expect(handler.routingKey).toBe(AUTH_EVENT_TYPES.USER_DELETED);
  });

  it('erases by id and address', async () => {
    await handler.handle({ userId: 'u1', email: 'gone@example.com' }, meta);
    expect(eraseUser).toHaveBeenCalledWith('u1', 'gone@example.com');
  });

  it('erases by id alone when the address is missing (an older event)', async () => {
    await handler.handle({ userId: 'u1' } as never, meta);
    expect(eraseUser).toHaveBeenCalledWith('u1', null);
  });

  it('ignores an event without a user', async () => {
    await handler.handle({} as never, meta);
    expect(eraseUser).not.toHaveBeenCalled();
  });
});
