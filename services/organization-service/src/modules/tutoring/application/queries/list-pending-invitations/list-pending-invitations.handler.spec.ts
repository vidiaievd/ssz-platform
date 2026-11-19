import { jest } from '@jest/globals';
import { ListPendingInvitationsHandler } from './list-pending-invitations.handler.js';
import { ListPendingInvitationsQuery } from './list-pending-invitations.query.js';

function build(group: { id: string; isDeleted: boolean } | null) {
  const groups = { findByTutorId: jest.fn(async () => group) };
  const invitations = { findAllByGroupId: jest.fn(async () => [{ id: 'inv-1' }]) };
  return { handler: new ListPendingInvitationsHandler(groups as never, invitations as never), invitations };
}

describe('ListPendingInvitationsHandler', () => {
  it('lists the legacy group invitations', async () => {
    const { handler } = build({ id: 'g-1', isDeleted: false });
    await expect(handler.execute(new ListPendingInvitationsQuery('tutor-1'))).resolves.toEqual([{ id: 'inv-1' }]);
  });

  it('answers an empty list to a tutor with no legacy group (a workspace-era tutor)', async () => {
    for (const group of [null, { id: 'g-1', isDeleted: true }]) {
      const { handler, invitations } = build(group);
      await expect(handler.execute(new ListPendingInvitationsQuery('tutor-1'))).resolves.toEqual([]);
      expect(invitations.findAllByGroupId).not.toHaveBeenCalled();
    }
  });
});
