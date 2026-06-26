import { jest } from '@jest/globals';
import { MarkGroupAssignedSeenHandler } from './mark-group-assigned-seen.handler.js';
import { MarkGroupAssignedSeenCommand } from './mark-group-assigned-seen.command.js';
import { SchoolMembership, type MembershipStatus } from '../../../domain/entities/school-membership.entity.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import type { ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';

function makeMembershipAt(status: MembershipStatus): SchoolMembership {
  const m = SchoolMembership.create({
    id: 'm-1',
    schoolId: 's-1',
    studentId: 'st-1',
    source: 'public-apply',
  });
  const path: MembershipStatus[] = ['onboarding', 'placement-review', 'active'];
  for (const next of path) {
    if (m.status === status) return m;
    m.transitionTo(next);
  }
  return m;
}

function makeMembershipRepoMock() {
  return {
    save: jest.fn(),
    findById: jest.fn<() => Promise<SchoolMembership | null>>(),
    findBySchoolAndStudent: jest.fn(),
    list: jest.fn(),
  };
}

describe('MarkGroupAssignedSeenHandler', () => {
  let membershipRepo: ReturnType<typeof makeMembershipRepoMock>;
  let handler: MarkGroupAssignedSeenHandler;

  beforeEach(() => {
    membershipRepo = makeMembershipRepoMock();
    handler = new MarkGroupAssignedSeenHandler(membershipRepo as unknown as ISchoolMembershipRepository);
  });

  it('records groupAssignedSeenAt for the membership owner', async () => {
    const membership = makeMembershipAt('active');
    membershipRepo.findById.mockResolvedValue(membership);

    await handler.execute(new MarkGroupAssignedSeenCommand('st-1', 's-1', 'm-1'));

    expect(membership.groupAssignedSeenAt).toBeInstanceOf(Date);
    expect(membershipRepo.save).toHaveBeenCalledWith(membership);
  });

  it('is idempotent — does not re-save once already seen', async () => {
    const membership = makeMembershipAt('active');
    membership.markGroupAssignedSeen();
    membershipRepo.findById.mockResolvedValue(membership);

    await handler.execute(new MarkGroupAssignedSeenCommand('st-1', 's-1', 'm-1'));

    expect(membershipRepo.save).not.toHaveBeenCalled();
  });

  it('rejects callers who are not the membership owner', async () => {
    const membership = makeMembershipAt('active');
    membershipRepo.findById.mockResolvedValue(membership);

    await expect(
      handler.execute(new MarkGroupAssignedSeenCommand('someone-else', 's-1', 'm-1')),
    ).rejects.toThrow(ForbiddenOperationException);
  });

  it('throws when the membership does not exist', async () => {
    membershipRepo.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new MarkGroupAssignedSeenCommand('st-1', 's-1', 'm-1')),
    ).rejects.toThrow(MembershipNotFoundException);
  });
});
