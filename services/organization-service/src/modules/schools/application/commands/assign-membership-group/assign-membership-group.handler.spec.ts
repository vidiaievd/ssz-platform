import { jest } from '@jest/globals';
import { AssignMembershipGroupHandler } from './assign-membership-group.handler.js';
import { AssignMembershipGroupCommand } from './assign-membership-group.command.js';
import { SchoolMembership, type MembershipStatus } from '../../../domain/entities/school-membership.entity.js';
import { School } from '../../../domain/entities/school.entity.js';
import { InvalidMembershipTransitionException } from '../../../domain/exceptions/invalid-membership-transition.exception.js';
import { GroupAssignedEvent } from '../../../domain/events/group-assigned.event.js';
import type { ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import type { ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import type { ISchoolGroupRepository } from '../../../domain/repositories/school-group.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';

function makeMembershipAt(status: MembershipStatus): SchoolMembership {
  const m = SchoolMembership.create({
    id: 'm-1',
    schoolId: 's-1',
    studentId: 'st-1',
    source: 'public-apply',
  });
  // Walk the lifecycle so each transition is legal, stopping at the requested status.
  const path: MembershipStatus[] = ['onboarding', 'placement-review'];
  for (const next of path) {
    if (m.status === status) return m;
    m.transitionTo(next);
  }
  return m;
}

function makeSchool(): School {
  return School.create({ id: 's-1', name: 'Test School', slug: 'test-school', ownerId: 'owner-1' }, 'evt-1');
}

function makeSchoolRepoMock() {
  return {
    findById: jest.fn<() => Promise<School | null>>(),
    findBySlug: jest.fn(),
    findByName: jest.fn(),
    findByOwnerId: jest.fn(),
    findMemberSchools: jest.fn(),
    findAllActive: jest.fn(),
    findManagerCapabilities: jest.fn(),
    save: jest.fn(),
  };
}

function makeMembershipRepoMock() {
  return {
    save: jest.fn(),
    findById: jest.fn<() => Promise<SchoolMembership | null>>(),
    findBySchoolAndStudent: jest.fn(),
    list: jest.fn(),
  };
}

describe('AssignMembershipGroupHandler', () => {
  let schoolRepo: ReturnType<typeof makeSchoolRepoMock>;
  let membershipRepo: ReturnType<typeof makeMembershipRepoMock>;
  let groupRepo: { findById: jest.Mock<() => Promise<{ name: string } | null>> };
  let eventPublisher: { publish: jest.Mock };
  let commandBus: { execute: jest.Mock };
  let handler: AssignMembershipGroupHandler;

  beforeEach(() => {
    schoolRepo = makeSchoolRepoMock();
    membershipRepo = makeMembershipRepoMock();
    groupRepo = { findById: jest.fn() };
    eventPublisher = { publish: jest.fn() };
    commandBus = { execute: jest.fn() };
    handler = new AssignMembershipGroupHandler(
      schoolRepo as unknown as ISchoolRepository,
      membershipRepo as unknown as ISchoolMembershipRepository,
      groupRepo as unknown as ISchoolGroupRepository,
      eventPublisher as unknown as IEventPublisher,
      commandBus as never,
    );

    schoolRepo.findById.mockResolvedValue(makeSchool());
    groupRepo.findById.mockResolvedValue({ name: 'Group A' });
  });

  it('assigns the group and activates a membership from placement-review', async () => {
    const membership = makeMembershipAt('placement-review');
    membershipRepo.findById.mockResolvedValue(membership);

    await handler.execute(new AssignMembershipGroupCommand('owner-1', 's-1', 'm-1', 'g-1'));

    expect(membership.status).toBe('active');
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(GroupAssignedEvent));
  });

  it('rejects activating a membership that is not in placement-review', async () => {
    const membership = makeMembershipAt('onboarding');
    membershipRepo.findById.mockResolvedValue(membership);

    await expect(
      handler.execute(new AssignMembershipGroupCommand('owner-1', 's-1', 'm-1', 'g-1')),
    ).rejects.toThrow(InvalidMembershipTransitionException);
    expect(membershipRepo.save).not.toHaveBeenCalled();
  });
});
