import { jest } from '@jest/globals';
import { ApproveMembershipHandler } from './approve-membership.handler.js';
import { ApproveMembershipCommand } from './approve-membership.command.js';
import { SchoolMembership } from '../../../domain/entities/school-membership.entity.js';
import { School } from '../../../domain/entities/school.entity.js';
import { EnrollmentApprovedEvent } from '../../../domain/events/enrollment-approved.event.js';
import type { ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import type { ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';

function makePendingMembership(): SchoolMembership {
  return SchoolMembership.create({
    id: 'm-1',
    schoolId: 's-1',
    studentId: 'st-1',
    source: 'public-apply',
  });
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

describe('ApproveMembershipHandler', () => {
  let schoolRepo: ReturnType<typeof makeSchoolRepoMock>;
  let membershipRepo: ReturnType<typeof makeMembershipRepoMock>;
  let eventPublisher: { publish: jest.Mock };
  let commandBus: { execute: jest.Mock<() => Promise<unknown>> };
  let handler: ApproveMembershipHandler;

  beforeEach(() => {
    schoolRepo = makeSchoolRepoMock();
    membershipRepo = makeMembershipRepoMock();
    eventPublisher = { publish: jest.fn() };
    commandBus = { execute: jest.fn() };
    handler = new ApproveMembershipHandler(
      schoolRepo as unknown as ISchoolRepository,
      membershipRepo as unknown as ISchoolMembershipRepository,
      eventPublisher as unknown as IEventPublisher,
      commandBus as never,
    );

    schoolRepo.findById.mockResolvedValue(makeSchool());
  });

  it('approves, adds the student to the roster, and publishes the event', async () => {
    const membership = makePendingMembership();
    membershipRepo.findById.mockResolvedValue(membership);
    commandBus.execute.mockResolvedValue(undefined);

    await handler.execute(new ApproveMembershipCommand('owner-1', 's-1', 'm-1'));

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(membership.status).toBe('onboarding');
    expect(membershipRepo.save).toHaveBeenCalledWith(membership);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(EnrollmentApprovedEvent));
  });

  it('fails the approval and does not publish the event when adding the student to the roster fails', async () => {
    const membership = makePendingMembership();
    membershipRepo.findById.mockResolvedValue(membership);
    commandBus.execute.mockRejectedValue(new Error('roster add failed'));

    await expect(
      handler.execute(new ApproveMembershipCommand('owner-1', 's-1', 'm-1')),
    ).rejects.toThrow('roster add failed');

    expect(membership.status).toBe('pending');
    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
