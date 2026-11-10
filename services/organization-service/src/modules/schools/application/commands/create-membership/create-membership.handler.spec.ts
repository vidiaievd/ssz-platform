import { jest } from '@jest/globals';
import { CreateMembershipHandler } from './create-membership.handler.js';
import { CreateMembershipCommand } from './create-membership.command.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolOnboardingSettings } from '../../../domain/entities/school-onboarding-settings.entity.js';
import { SchoolMembership } from '../../../domain/entities/school-membership.entity.js';
import { AddMemberCommand } from '../add-member/add-member.command.js';
import { EnrollmentRequestEvent } from '../../../domain/events/enrollment-request.event.js';
import { SeatsExhaustedException } from '../../../domain/exceptions/seats-exhausted.exception.js';

function makeSchool(): School {
  return School.create({ id: 's-1', name: 'Test School', slug: 'test-school', ownerId: 'owner-1' }, 'evt-1');
}

function autoSettings(): SchoolOnboardingSettings {
  const d = SchoolOnboardingSettings.defaults('s-1');
  return Object.assign(Object.create(Object.getPrototypeOf(d)), d, { approvalMode: 'auto' });
}

describe('CreateMembershipHandler — auto-approve and student seats (plan 90, phase 4)', () => {
  let schoolRepo: { findById: jest.Mock<() => Promise<School | null>> };
  let membershipRepo: { save: jest.Mock<(m: SchoolMembership) => Promise<void>> };
  let settingsRepo: { findBySchoolId: jest.Mock<() => Promise<SchoolOnboardingSettings | null>> };
  let eventPublisher: { publish: jest.Mock };
  let profileService: { getProfileSummary: jest.Mock<() => Promise<null>> };
  let commandBus: { execute: jest.Mock<() => Promise<unknown>> };
  let handler: CreateMembershipHandler;
  /** Status of the membership at each save, in order. */
  let savedStatuses: string[];

  beforeEach(() => {
    savedStatuses = [];
    schoolRepo = { findById: jest.fn<() => Promise<School | null>>() };
    membershipRepo = {
      save: jest.fn(async (m: SchoolMembership) => {
        savedStatuses.push(m.status);
      }),
    };
    settingsRepo = { findBySchoolId: jest.fn<() => Promise<SchoolOnboardingSettings | null>>() };
    eventPublisher = { publish: jest.fn() };
    profileService = { getProfileSummary: jest.fn<() => Promise<null>>() };
    commandBus = { execute: jest.fn<() => Promise<unknown>>() };

    schoolRepo.findById.mockResolvedValue(makeSchool());
    settingsRepo.findBySchoolId.mockResolvedValue(autoSettings());
    profileService.getProfileSummary.mockResolvedValue(null);
    commandBus.execute.mockResolvedValue({ seats: null });

    handler = new CreateMembershipHandler(
      schoolRepo as never,
      membershipRepo as never,
      settingsRepo as never,
      eventPublisher as never,
      profileService as never,
      commandBus as never,
    );
  });

  it('a seat left: the learner goes on the roster and the application to onboarding', async () => {
    const m = await handler.execute(new CreateMembershipCommand('st-1', 's-1', 'public-apply', 'nb'));

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(AddMemberCommand));
    // Stored pending first, so AddMember finds it and creates no `direct` one beside it.
    expect(savedStatuses).toEqual(['pending', 'onboarding']);
    expect(m.status).toBe('onboarding');
    expect(m.blockedReason).toBeUndefined();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('no seat: the application stays pending, marked no_seats, and the school is told like for a manual one', async () => {
    commandBus.execute.mockRejectedValue(
      new SeatsExhaustedException('s-1', { used: 6, limit: 5, ceiling: 6, state: 'full' }),
    );

    const m = await handler.execute(new CreateMembershipCommand('st-1', 's-1', 'public-apply', 'nb'));

    expect(m.status).toBe('pending');
    expect(m.blockedReason).toBe('no_seats');
    expect(savedStatuses.at(-1)).toBe('pending');
    expect(membershipRepo.save.mock.calls.at(-1)![0].blockedReason).toBe('no_seats');
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(EnrollmentRequestEvent));
  });

  it('any other roster failure keeps the old behaviour: logged, application still onboarding', async () => {
    commandBus.execute.mockRejectedValue(new Error('db hiccup'));

    const m = await handler.execute(new CreateMembershipCommand('st-1', 's-1', 'public-apply', 'nb'));

    expect(m.status).toBe('onboarding');
    expect(m.blockedReason).toBeUndefined();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('manual mode never touches the roster', async () => {
    settingsRepo.findBySchoolId.mockResolvedValue(null);

    const m = await handler.execute(new CreateMembershipCommand('st-1', 's-1', 'public-apply', 'nb'));

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(m.status).toBe('pending');
    expect(m.blockedReason).toBeUndefined();
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(EnrollmentRequestEvent));
  });
});
