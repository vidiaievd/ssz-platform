import { jest } from '@jest/globals';
import { EnrollInContainerHandler } from '../../../../../src/modules/enrollments/application/commands/enroll-in-container.handler.js';
import { EnrollInContainerCommand } from '../../../../../src/modules/enrollments/application/commands/enroll-in-container.command.js';
import {
  EnrollmentAlreadyExistsError,
  AccessDeniedForContainerError,
  ContentServiceUnavailableError,
  OrganizationServiceUnavailableError,
} from '../../../../../src/modules/enrollments/application/errors/enrollment-application.errors.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import { ContentClientError } from '../../../../../src/shared/application/ports/content-client.port.js';
import { OrganizationClientError } from '../../../../../src/shared/application/ports/organization-client.port.js';
import type { IEnrollmentRepository } from '../../../../../src/modules/enrollments/domain/repositories/enrollment.repository.interface.js';
import type { IContentClient } from '../../../../../src/shared/application/ports/content-client.port.js';
import type { IOrganizationClient } from '../../../../../src/shared/application/ports/organization-client.port.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';
import { Enrollment } from '../../../../../src/modules/enrollments/domain/entities/enrollment.entity.js';

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTAINER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const SCHOOL_ID = 'cccccccc-0000-4000-8000-000000000003';
const NOW = new Date('2026-01-01T12:00:00Z');

// jest.fn typed as returning Promise<unknown> so mockResolvedValue accepts any value
const mockFn = () => jest.fn<() => Promise<unknown>>();

const OWNER_ID = 'dddddddd-0000-4000-8000-000000000004';
const LEARNER_WORKSPACE_ID = 'eeeeeeee-0000-4000-8000-000000000005';

const makeHandler = (overrides: Partial<{
  existingEnrollment: Enrollment | null;
  accessTier: string;
  tierError: boolean;
  memberRole: string | null;
  orgError: boolean;
  learnerWorkspaceId: string | null;
  workspaceLookupError: boolean;
  ownerLookupError: boolean;
}> = {}) => {
  const {
    existingEnrollment = null,
    accessTier = 'PUBLIC_FREE',
    tierError = false,
    memberRole = 'STUDENT',
    orgError = false,
    learnerWorkspaceId = LEARNER_WORKSPACE_ID,
    workspaceLookupError = false,
    ownerLookupError = false,
  } = overrides;

  const repo = {
    findById: jest.fn(),
    findByUserAndContainer: mockFn().mockResolvedValue(existingEnrollment),
    findByUser: jest.fn(),
    save: mockFn().mockResolvedValue(undefined),
    softDelete: jest.fn(),
  } as unknown as IEnrollmentRepository;

  const contentClient = {
    getContentMetadata: jest.fn(),
    checkVisibilityForUser: jest.fn(),
    getAccessTier: tierError
      ? mockFn().mockResolvedValue(Result.fail(new ContentClientError('timeout')))
      : mockFn().mockResolvedValue(Result.ok(accessTier)),
    getContainerLeafItems: jest.fn(),
    getContainerOwner: ownerLookupError
      ? mockFn().mockResolvedValue(Result.fail(new ContentClientError('timeout')))
      : mockFn().mockResolvedValue(Result.ok({ ownerUserId: OWNER_ID, ownerSchoolId: null })),
  } as unknown as IContentClient;

  const orgClient = {
    getMemberRole: orgError
      ? mockFn().mockResolvedValue(Result.fail(new OrganizationClientError('timeout')))
      : mockFn().mockResolvedValue(Result.ok(memberRole)),
    getLearnerWorkspace: workspaceLookupError
      ? mockFn().mockResolvedValue(Result.fail(new OrganizationClientError('timeout')))
      : mockFn().mockResolvedValue(
          Result.ok({ schoolId: learnerWorkspaceId, groupId: null, groupName: null }),
        ),
  } as unknown as IOrganizationClient;

  const publisher = {
    publish: mockFn().mockResolvedValue(undefined),
  } as unknown as IEventPublisher;

  const clock: IClock = { now: () => NOW };

  return {
    handler: new EnrollInContainerHandler(repo, contentClient, orgClient, publisher, clock),
    repo,
    publisher,
    contentClient,
    orgClient,
  };
};

describe('EnrollInContainerHandler', () => {
  it('enrolls on PUBLIC_FREE tier', async () => {
    const { handler, repo, publisher } = makeHandler();
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID, SCHOOL_ID);

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.userId).toBe(USER_ID);
    expect(result.value.status).toBe('ACTIVE');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith('learning.enrollment.created', expect.any(Object));
  });

  it('fails if already enrolled (ACTIVE)', async () => {
    const existing = Enrollment.create({ userId: USER_ID, containerId: CONTAINER_ID }, NOW);
    const { handler } = makeHandler({ existingEnrollment: existing });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(EnrollmentAlreadyExistsError);
  });

  // The row is unique on (userId, containerId), so "enrol again" has to be the same row
  // brought back — saving a second aggregate reached the database as a constraint
  // violation and the learner got a 500 for pressing Enrol.
  it('revives the row a learner left rather than creating a second one', async () => {
    const existing = Enrollment.create({ userId: USER_ID, containerId: CONTAINER_ID }, NOW);
    existing.unenroll();
    const { handler, repo, publisher } = makeHandler({ existingEnrollment: existing });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID);

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.id).toBe(existing.id);
    expect(result.value.status).toBe('ACTIVE');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect((repo.save as unknown as jest.Mock).mock.calls[0]?.[0]).toBe(existing);
    // Projections downstream flip a learner back to ACTIVE on this event, keyed by the
    // enrollment id they were already told about.
    expect(publisher.publish).toHaveBeenCalledWith(
      'learning.enrollment.created',
      expect.objectContaining({ enrollmentId: existing.id }),
    );
  });

  // Finishing a course is not "no longer enrolled": re-enrolling would have to clear the
  // completion, and the learner keeps their access either way.
  it('refuses to re-enrol a learner who completed the course', async () => {
    const existing = Enrollment.create({ userId: USER_ID, containerId: CONTAINER_ID }, NOW);
    existing.complete(NOW);
    const { handler, repo } = makeHandler({ existingEnrollment: existing });

    const result = await handler.execute(new EnrollInContainerCommand(USER_ID, CONTAINER_ID));

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(EnrollmentAlreadyExistsError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('fails with ASSIGNED_ONLY tier', async () => {
    const { handler } = makeHandler({ accessTier: 'ASSIGNED_ONLY' });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AccessDeniedForContainerError);
  });

  it('fails with PUBLIC_PAID tier', async () => {
    const { handler } = makeHandler({ accessTier: 'PUBLIC_PAID' });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AccessDeniedForContainerError);
  });

  it('enrolls on FREE_WITHIN_SCHOOL with valid school membership', async () => {
    const { handler } = makeHandler({ accessTier: 'FREE_WITHIN_SCHOOL', memberRole: 'STUDENT' });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID, SCHOOL_ID);

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
  });

  it('fails on FREE_WITHIN_SCHOOL without schoolId', async () => {
    const { handler } = makeHandler({ accessTier: 'FREE_WITHIN_SCHOOL' });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AccessDeniedForContainerError);
  });

  it('fails on FREE_WITHIN_SCHOOL when not a school member', async () => {
    const { handler } = makeHandler({ accessTier: 'FREE_WITHIN_SCHOOL', memberRole: null });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID, SCHOOL_ID);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AccessDeniedForContainerError);
  });

  it('fails when Content Service is unavailable', async () => {
    const { handler } = makeHandler({ tierError: true });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentServiceUnavailableError);
  });

  // A private tutor's course belongs to no school, so nobody names one when their student
  // enrols — and the row used to be stored with no workspace at all, which is why the
  // tutor's dashboard counted zero students of a course they teach themselves.
  describe('workspace attribution when the caller names none', () => {
    it('files the enrolment under the learner\'s own workspace', async () => {
      const { handler, publisher, orgClient } = makeHandler();

      const result = await handler.execute(new EnrollInContainerCommand(USER_ID, CONTAINER_ID));

      expect(result.isOk).toBe(true);
      expect(result.value.schoolId).toBe(LEARNER_WORKSPACE_ID);
      expect(publisher.publish).toHaveBeenCalledWith(
        'learning.enrollment.created',
        expect.objectContaining({ schoolId: LEARNER_WORKSPACE_ID }),
      );
      // The course's author breaks the tie for a learner who studies both at a school and
      // with a private tutor — without it the tutor's course lands in the school.
      expect(orgClient.getLearnerWorkspace).toHaveBeenCalledWith(USER_ID, {
        courseId: CONTAINER_ID,
        preferredSchoolId: null,
        preferredTeacherId: OWNER_ID,
      });
    });

    it('keeps the workspace the caller stated rather than asking', async () => {
      const { handler, orgClient } = makeHandler();

      const result = await handler.execute(
        new EnrollInContainerCommand(USER_ID, CONTAINER_ID, SCHOOL_ID),
      );

      expect(result.value.schoolId).toBe(SCHOOL_ID);
      expect(orgClient.getLearnerWorkspace).not.toHaveBeenCalled();
    });

    it('carries the resolved workspace onto a row the learner is coming back to', async () => {
      const existing = Enrollment.create({ userId: USER_ID, containerId: CONTAINER_ID }, NOW);
      existing.unenroll();
      const { handler } = makeHandler({ existingEnrollment: existing });

      const result = await handler.execute(new EnrollInContainerCommand(USER_ID, CONTAINER_ID));

      expect(result.isOk).toBe(true);
      expect(result.value.schoolId).toBe(LEARNER_WORKSPACE_ID);
    });

    // Losing a number on a dashboard is not a reason to refuse a learner the course.
    it('still enrols when the neighbour cannot be asked', async () => {
      const { handler } = makeHandler({ workspaceLookupError: true });

      const result = await handler.execute(new EnrollInContainerCommand(USER_ID, CONTAINER_ID));

      expect(result.isOk).toBe(true);
      expect(result.value.schoolId).toBeNull();
    });

    it('still enrols when the course owner cannot be read', async () => {
      const { handler, orgClient } = makeHandler({ ownerLookupError: true });

      const result = await handler.execute(new EnrollInContainerCommand(USER_ID, CONTAINER_ID));

      expect(result.isOk).toBe(true);
      expect(result.value.schoolId).toBeNull();
      expect(orgClient.getLearnerWorkspace).not.toHaveBeenCalled();
    });

    it('leaves the enrolment unattributed when the learner is in no workspace', async () => {
      const { handler } = makeHandler({ learnerWorkspaceId: null });

      const result = await handler.execute(new EnrollInContainerCommand(USER_ID, CONTAINER_ID));

      expect(result.isOk).toBe(true);
      expect(result.value.schoolId).toBeNull();
    });
  });

  it('fails when Organization Service is unavailable', async () => {
    const { handler } = makeHandler({ accessTier: 'FREE_WITHIN_SCHOOL', orgError: true });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID, SCHOOL_ID);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(OrganizationServiceUnavailableError);
  });
});
