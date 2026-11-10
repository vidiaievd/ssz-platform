import { jest } from '@jest/globals';
import { AcceptInvitationHandler } from './accept-invitation.handler.js';
import { AcceptInvitationCommand } from './accept-invitation.command.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolInvitation } from '../../../domain/entities/school-invitation.entity.js';
import { SchoolGroup } from '../../../domain/entities/school-group.entity.js';
import { InvitationStatus } from '../../../domain/value-objects/invitation-status.vo.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { GroupAssignedEvent } from '../../../domain/events/group-assigned.event.js';
import { GroupMemberAddedEvent } from '../../../domain/events/group-member-added.event.js';
import { SeatsExhaustedException } from '../../../domain/exceptions/seats-exhausted.exception.js';
import type { SeatUsage } from '../../../domain/value-objects/seat-policy.vo.js';
import { SchoolNotActiveException } from '../../../domain/exceptions/school-not-active.exception.js';
import { SchoolType } from '../../../domain/value-objects/school-type.vo.js';

function makeSchool(): School {
  return School.create({ id: 's-1', name: 'Test School', slug: 'test-school', ownerId: 'owner-1' }, 'evt-1');
}

function makeInvitation(overrides: { targetGroupId?: string | null } = {}): SchoolInvitation {
  return SchoolInvitation.create({
    id: 'inv-1',
    schoolId: 's-1',
    email: 'student@example.com',
    role: MemberRole.STUDENT,
    kind: 'register',
    targetGroupId: overrides.targetGroupId ?? null,
    token: 'tok-1',
    status: InvitationStatus.PENDING,
    expiresAt: new Date(Date.now() + 60_000),
    lastSentAt: new Date(),
    resendCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeGroup(overrides: { isDeleted?: boolean; schoolId?: string } = {}): SchoolGroup {
  return {
    id: 'g-1',
    name: 'Group A',
    schoolId: overrides.schoolId ?? 's-1',
    isDeleted: overrides.isDeleted ?? false,
  } as unknown as SchoolGroup;
}

describe('AcceptInvitationHandler', () => {
  let schoolRepo: { findById: jest.Mock<() => Promise<School | null>>; save: jest.Mock<() => Promise<void>> };
  let invitationRepo: { findByToken: jest.Mock<() => Promise<SchoolInvitation | null>>; save: jest.Mock<() => Promise<void>> };
  let groupRepo: { findById: jest.Mock<() => Promise<SchoolGroup | null>>; saveWithMember: jest.Mock<() => Promise<void>> };
  let membershipRepo: { findBySchoolAndStudent: jest.Mock<() => Promise<null>>; save: jest.Mock<() => Promise<void>> };
  let eventPublisher: { publish: jest.Mock<() => Promise<void>> };
  let profileService: { getProfileSummary: jest.Mock<() => Promise<null>> };
  let tokenService: { verify: jest.Mock<() => { email: string }> };
  let prisma: { schoolMember: { findUnique: jest.Mock }; schoolTeacher: { upsert: jest.Mock }; schoolMemberPermission: { upsert: jest.Mock } };
  let seatGate: { claim: jest.Mock<() => Promise<SeatUsage | null>> };
  let handler: AcceptInvitationHandler;

  beforeEach(() => {
    schoolRepo = { findById: jest.fn(), save: jest.fn() };
    invitationRepo = { findByToken: jest.fn(), save: jest.fn() };
    groupRepo = { findById: jest.fn(), saveWithMember: jest.fn() };
    membershipRepo = { findBySchoolAndStudent: jest.fn(), save: jest.fn() };
    eventPublisher = { publish: jest.fn() };
    profileService = { getProfileSummary: jest.fn() };
    tokenService = { verify: jest.fn() };
    seatGate = { claim: jest.fn<() => Promise<SeatUsage | null>>() };
    seatGate.claim.mockResolvedValue({ used: 5, limit: 5, ceiling: 6, state: 'ok' });
    prisma = {
      schoolMember: { findUnique: jest.fn() },
      schoolTeacher: { upsert: jest.fn() },
      schoolMemberPermission: { upsert: jest.fn() },
    };

    profileService.getProfileSummary.mockResolvedValue(null);
    tokenService.verify.mockReturnValue({ email: 'student@example.com' });
    schoolRepo.findById.mockResolvedValue(makeSchool());
    membershipRepo.findBySchoolAndStudent.mockResolvedValue(null);

    handler = new AcceptInvitationHandler(
      schoolRepo as never,
      invitationRepo as never,
      groupRepo as never,
      membershipRepo as never,
      eventPublisher as never,
      profileService as never,
      tokenService as never,
      prisma as never,
      seatGate as never,
    );
  });

  // Plan 90, phase 5: accepted by token, so no path guard sees the school — the aggregate refuses.
  it.each(['suspended', 'closed'] as const)('a %s school takes nobody in by invitation', async (status) => {
    const now = new Date();
    schoolRepo.findById.mockResolvedValue(
      School.rehydrate({
        id: 's-1', name: 'Test School', slug: 'test-school', ownerId: 'owner-1', type: SchoolType.ONLINE,
        isActive: false, createdAt: now, updatedAt: now, members: [], requireTutorReviewForSelfPaced: false,
        lifecycle: { status, closesAt: null, purgeAt: null },
      }),
    );
    invitationRepo.findByToken.mockResolvedValue(makeInvitation({ targetGroupId: 'g-1' }));

    await expect(
      handler.execute(new AcceptInvitationCommand('student-1', 'student@example.com', 'tok-1')),
    ).rejects.toMatchObject({ constructor: SchoolNotActiveException, status });
    expect(seatGate.claim).not.toHaveBeenCalled();
    expect(invitationRepo.save).not.toHaveBeenCalled();
    expect(schoolRepo.save).not.toHaveBeenCalled();
  });

  it('skips the new membership straight to active when the invite carries a target group', async () => {
    invitationRepo.findByToken.mockResolvedValue(makeInvitation({ targetGroupId: 'g-1' }));
    groupRepo.findById.mockResolvedValue(makeGroup());

    await handler.execute(new AcceptInvitationCommand('student-1', 'student@example.com', 'tok-1'));

    expect(groupRepo.saveWithMember).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-1' }), 'student-1', expect.any(String));
    expect(membershipRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(GroupAssignedEvent));
  });

  /**
   * The roster event, not the pipeline one: without it the learner joins a group whose
   * entitlements, enrolment and analytics projections never hear about them.
   */
  it('announces the learner joining the group, like add-group-member does', async () => {
    invitationRepo.findByToken.mockResolvedValue(makeInvitation({ targetGroupId: 'g-1' }));
    groupRepo.findById.mockResolvedValue(makeGroup());

    await handler.execute(new AcceptInvitationCommand('student-1', 'student@example.com', 'tok-1'));

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'school.group.member.added',
        groupId: 'g-1',
        userId: 'student-1',
      }),
    );
  });

  it('leaves the membership at onboarding when the invite has no target group', async () => {
    invitationRepo.findByToken.mockResolvedValue(makeInvitation());

    await handler.execute(new AcceptInvitationCommand('student-1', 'student@example.com', 'tok-1'));

    expect(groupRepo.saveWithMember).not.toHaveBeenCalled();
    expect(membershipRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'onboarding' }));
    expect(eventPublisher.publish).not.toHaveBeenCalledWith(expect.any(GroupAssignedEvent));
    expect(eventPublisher.publish).not.toHaveBeenCalledWith(expect.any(GroupMemberAddedEvent));
  });

  it('does not touch membership status when the target group no longer exists', async () => {
    invitationRepo.findByToken.mockResolvedValue(makeInvitation({ targetGroupId: 'g-deleted' }));
    groupRepo.findById.mockResolvedValue(null);

    await handler.execute(new AcceptInvitationCommand('student-1', 'student@example.com', 'tok-1'));

    expect(groupRepo.saveWithMember).not.toHaveBeenCalled();
    expect(membershipRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'onboarding' }));
  });

  describe('student seats (plan 90, phase 4)', () => {
    it('a learner takes a seat and the answer carries it', async () => {
      invitationRepo.findByToken.mockResolvedValue(makeInvitation());

      await expect(
        handler.execute(new AcceptInvitationCommand('student-1', 'student@example.com', 'tok-1')),
      ).resolves.toEqual({ seats: { used: 5, limit: 5, ceiling: 6, state: 'ok' } });
      expect(seatGate.claim).toHaveBeenCalledWith('s-1', expect.objectContaining({ kind: 'insert', userId: 'student-1' }));
    });

    it('no seat → SEATS_EXHAUSTED, the invitation stays pending and nothing is written', async () => {
      const invitation = makeInvitation({ targetGroupId: 'g-1' });
      invitationRepo.findByToken.mockResolvedValue(invitation);
      groupRepo.findById.mockResolvedValue(makeGroup());
      seatGate.claim.mockRejectedValue(
        new SeatsExhaustedException('s-1', { used: 6, limit: 5, ceiling: 6, state: 'full' }),
      );

      await expect(
        handler.execute(new AcceptInvitationCommand('student-1', 'student@example.com', 'tok-1')),
      ).rejects.toBeInstanceOf(SeatsExhaustedException);
      expect(invitation.isPending()).toBe(true);
      expect(invitationRepo.save).not.toHaveBeenCalled();
      expect(schoolRepo.save).not.toHaveBeenCalled();
      expect(groupRepo.saveWithMember).not.toHaveBeenCalled();
      expect(membershipRepo.save).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('staff take no seat', async () => {
      const invitation = SchoolInvitation.create({
        id: 'inv-2',
        schoolId: 's-1',
        email: 'student@example.com',
        role: MemberRole.SCHEDULER,
        kind: 'register',
        targetGroupId: null,
        token: 'tok-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 60_000),
        lastSentAt: new Date(),
        resendCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      invitationRepo.findByToken.mockResolvedValue(invitation);

      await expect(
        handler.execute(new AcceptInvitationCommand('staff-1', 'student@example.com', 'tok-1')),
      ).resolves.toEqual({ seats: null });
      expect(seatGate.claim).not.toHaveBeenCalled();
    });
  });
});
