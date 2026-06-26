import { jest } from '@jest/globals';
import { CompleteMembershipOnboardingHandler } from './complete-membership-onboarding.handler.js';
import { CompleteMembershipOnboardingCommand } from './complete-membership-onboarding.command.js';
import { SchoolMembership } from '../../../domain/entities/school-membership.entity.js';
import { School } from '../../../domain/entities/school.entity.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { InvalidMembershipTransitionException } from '../../../domain/exceptions/invalid-membership-transition.exception.js';
import { PlacementReviewReadyEvent } from '../../../domain/events/placement-review-ready.event.js';
import type { ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import type { ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';

function makeOnboardingMembership(): SchoolMembership {
  const m = SchoolMembership.create({
    id: 'm-1',
    schoolId: 's-1',
    studentId: 'st-1',
    source: 'public-apply',
  });
  m.transitionTo('onboarding');
  return m;
}

function makeSchool(): School {
  return School.create({ id: 's-1', name: 'Test School', slug: 'test-school', ownerId: 'owner-1' }, 'evt-1');
}

function makeMembershipRepoMock() {
  return {
    save: jest.fn(),
    findById: jest.fn<() => Promise<SchoolMembership | null>>(),
    findBySchoolAndStudent: jest.fn(),
    list: jest.fn(),
  };
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

describe('CompleteMembershipOnboardingHandler', () => {
  let membershipRepo: ReturnType<typeof makeMembershipRepoMock>;
  let schoolRepo: ReturnType<typeof makeSchoolRepoMock>;
  let eventPublisher: { publish: jest.Mock };
  let handler: CompleteMembershipOnboardingHandler;

  beforeEach(() => {
    membershipRepo = makeMembershipRepoMock();
    schoolRepo = makeSchoolRepoMock();
    eventPublisher = { publish: jest.fn() };
    handler = new CompleteMembershipOnboardingHandler(
      membershipRepo as unknown as ISchoolMembershipRepository,
      schoolRepo as unknown as ISchoolRepository,
      eventPublisher as unknown as IEventPublisher,
    );
  });

  it('always resolves onboarding to placement-review, even for an auto-place school', async () => {
    const membership = makeOnboardingMembership();
    membershipRepo.findById.mockResolvedValue(membership);
    schoolRepo.findById.mockResolvedValue(makeSchool());

    await handler.execute(new CompleteMembershipOnboardingCommand('st-1', 's-1', 'm-1'));

    expect(membership.status).toBe('placement-review');
    expect(membershipRepo.save).toHaveBeenCalledWith(membership);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(PlacementReviewReadyEvent));
  });

  it('throws InvalidMembershipTransitionException when the membership cannot reach placement-review', async () => {
    const membership = SchoolMembership.create({
      id: 'm-2',
      schoolId: 's-1',
      studentId: 'st-1',
      source: 'public-apply',
    }); // still pending — onboarding → active is not reachable from here either
    membershipRepo.findById.mockResolvedValue(membership);

    await expect(
      handler.execute(new CompleteMembershipOnboardingCommand('st-1', 's-1', 'm-2')),
    ).rejects.toThrow(InvalidMembershipTransitionException);
  });

  it('rejects callers who are not the membership owner', async () => {
    const membership = makeOnboardingMembership();
    membershipRepo.findById.mockResolvedValue(membership);

    await expect(
      handler.execute(new CompleteMembershipOnboardingCommand('someone-else', 's-1', 'm-1')),
    ).rejects.toThrow(ForbiddenOperationException);
  });
});
