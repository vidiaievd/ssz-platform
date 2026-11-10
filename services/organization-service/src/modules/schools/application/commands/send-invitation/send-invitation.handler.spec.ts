import { jest } from '@jest/globals';
import { SendInvitationHandler } from './send-invitation.handler.js';
import { SendInvitationCommand } from './send-invitation.command.js';
import { School } from '../../../domain/entities/school.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SeatsExhaustedException } from '../../../domain/exceptions/seats-exhausted.exception.js';

describe('SendInvitationHandler — student seats (plan 90, phase 4)', () => {
  let invitationRepo: { findActivePendingByEmailAndRole: jest.Mock<() => Promise<null>>; save: jest.Mock };
  let eventPublisher: { publish: jest.Mock };
  let seatGate: { assertRoomForOneMore: jest.Mock<() => Promise<void>> };
  let handler: SendInvitationHandler;

  beforeEach(() => {
    const schoolRepo = {
      findById: jest.fn(async () =>
        School.create({ id: 's-1', name: 'Test School', slug: 'test-school', ownerId: 'owner-1' }, 'evt-1'),
      ),
    };
    invitationRepo = { findActivePendingByEmailAndRole: jest.fn(async () => null), save: jest.fn() };
    eventPublisher = { publish: jest.fn() };
    seatGate = { assertRoomForOneMore: jest.fn(async () => undefined) };
    handler = new SendInvitationHandler(
      schoolRepo as never,
      invitationRepo as never,
      eventPublisher as never,
      { getProfileSummary: jest.fn() } as never,
      { sign: jest.fn(() => 'tok') } as never,
      {} as never,
      {} as never,
      { get: jest.fn(() => undefined) } as never,
      seatGate as never,
    );
  });

  const invite = (role: MemberRole) =>
    handler.execute(new SendInvitationCommand('owner-1', 's-1', 'x@example.com', role));

  it('a student invitation at the ceiling is refused before anything is stored or sent', async () => {
    seatGate.assertRoomForOneMore.mockRejectedValue(
      new SeatsExhaustedException('s-1', { used: 33, limit: 30, ceiling: 33, state: 'full' }),
    );

    await expect(invite(MemberRole.STUDENT)).rejects.toBeInstanceOf(SeatsExhaustedException);
    expect(seatGate.assertRoomForOneMore).toHaveBeenCalledWith('s-1');
    expect(invitationRepo.save).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('below the ceiling the invitation goes out', async () => {
    await expect(invite(MemberRole.STUDENT)).resolves.toEqual(expect.objectContaining({ token: 'tok' }));
    expect(invitationRepo.save).toHaveBeenCalled();
  });

  it('staff invitations are not counted against seats', async () => {
    await invite(MemberRole.TEACHER);
    expect(seatGate.assertRoomForOneMore).not.toHaveBeenCalled();
  });
});
