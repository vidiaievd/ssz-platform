import { jest } from '@jest/globals';
import { AddMemberHandler } from './add-member.handler.js';
import { AddMemberCommand } from './add-member.command.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolMembership } from '../../../domain/entities/school-membership.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import type { ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import type { ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';
import type { IProfileServicePort, ProfileSummary } from '../../../../../shared/application/ports/profile-service.interface.js';

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
    findById: jest.fn(),
    findBySchoolAndStudent: jest.fn<() => Promise<SchoolMembership | null>>(),
    list: jest.fn(),
  };
}

describe('AddMemberHandler', () => {
  let schoolRepo: ReturnType<typeof makeSchoolRepoMock>;
  let membershipRepo: ReturnType<typeof makeMembershipRepoMock>;
  let eventPublisher: { publish: jest.Mock };
  let profileService: {
    getProfileSummary: jest.Mock<() => Promise<ProfileSummary | null>>;
    getTeachingLanguages: jest.Mock;
  };
  let handler: AddMemberHandler;

  beforeEach(() => {
    schoolRepo = makeSchoolRepoMock();
    membershipRepo = makeMembershipRepoMock();
    eventPublisher = { publish: jest.fn() };
    profileService = {
      getProfileSummary: jest.fn<() => Promise<ProfileSummary | null>>(),
      getTeachingLanguages: jest.fn(),
    };
    handler = new AddMemberHandler(
      schoolRepo as unknown as ISchoolRepository,
      membershipRepo as unknown as ISchoolMembershipRepository,
      eventPublisher as unknown as IEventPublisher,
      profileService as unknown as IProfileServicePort,
    );

    schoolRepo.findById.mockResolvedValue(makeSchool());
    profileService.getProfileSummary.mockResolvedValue(null);
    membershipRepo.findBySchoolAndStudent.mockResolvedValue(null);
  });

  it('creates an active direct membership when a student is added directly with none existing', async () => {
    await handler.execute(new AddMemberCommand('owner-1', 's-1', 'st-1', MemberRole.STUDENT));

    expect(membershipRepo.save).toHaveBeenCalledTimes(1);
    const saved = membershipRepo.save.mock.calls[0]![0] as SchoolMembership;
    expect(saved.studentId).toBe('st-1');
    expect(saved.source).toBe('direct');
    expect(saved.status).toBe('active');
  });

  it('does not create a membership for non-student roles', async () => {
    await handler.execute(new AddMemberCommand('owner-1', 's-1', 'te-1', MemberRole.TEACHER));

    expect(membershipRepo.findBySchoolAndStudent).not.toHaveBeenCalled();
    expect(membershipRepo.save).not.toHaveBeenCalled();
  });

  it('does not duplicate a membership when a non-terminal one already exists (enrolment flow)', async () => {
    const existing = SchoolMembership.create({ id: 'm-1', schoolId: 's-1', studentId: 'st-1', source: 'public-apply' });
    existing.transitionTo('onboarding');
    membershipRepo.findBySchoolAndStudent.mockResolvedValue(existing);

    await handler.execute(new AddMemberCommand('owner-1', 's-1', 'st-1', MemberRole.STUDENT));

    expect(membershipRepo.save).not.toHaveBeenCalled();
  });

  it('creates a fresh membership when re-adding a student whose previous membership is terminal', async () => {
    const rejected = SchoolMembership.rehydrate({
      id: 'm-old',
      schoolId: 's-1',
      studentId: 'st-1',
      source: 'public-apply',
      status: 'rejected',
      language: undefined,
      selfReportedLevel: undefined,
      availability: undefined,
      ageBand: undefined,
      groupAssignedSeenAt: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    membershipRepo.findBySchoolAndStudent.mockResolvedValue(rejected);

    await handler.execute(new AddMemberCommand('owner-1', 's-1', 'st-1', MemberRole.STUDENT));

    expect(membershipRepo.save).toHaveBeenCalledTimes(1);
    const saved = membershipRepo.save.mock.calls[0]![0] as SchoolMembership;
    expect(saved.id).not.toBe('m-old');
    expect(saved.status).toBe('active');
  });
});
