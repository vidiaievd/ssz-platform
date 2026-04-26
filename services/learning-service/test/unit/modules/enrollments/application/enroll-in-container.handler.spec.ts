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

const makeHandler = (overrides: Partial<{
  existingEnrollment: Enrollment | null;
  accessTier: string;
  tierError: boolean;
  memberRole: string | null;
  orgError: boolean;
}> = {}) => {
  const {
    existingEnrollment = null,
    accessTier = 'PUBLIC_FREE',
    tierError = false,
    memberRole = 'STUDENT',
    orgError = false,
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
  } as unknown as IContentClient;

  const orgClient = {
    getMemberRole: orgError
      ? mockFn().mockResolvedValue(Result.fail(new OrganizationClientError('timeout')))
      : mockFn().mockResolvedValue(Result.ok(memberRole)),
  } as unknown as IOrganizationClient;

  const publisher = {
    publish: mockFn().mockResolvedValue(undefined),
  } as unknown as IEventPublisher;

  const clock: IClock = { now: () => NOW };

  return {
    handler: new EnrollInContainerHandler(repo, contentClient, orgClient, publisher, clock),
    repo,
    publisher,
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

  it('enrolls when previously unenrolled (non-ACTIVE existing)', async () => {
    const existing = Enrollment.create({ userId: USER_ID, containerId: CONTAINER_ID }, NOW);
    existing.unenroll();
    const { handler, repo } = makeHandler({ existingEnrollment: existing });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID);

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
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

  it('fails when Organization Service is unavailable', async () => {
    const { handler } = makeHandler({ accessTier: 'FREE_WITHIN_SCHOOL', orgError: true });
    const cmd = new EnrollInContainerCommand(USER_ID, CONTAINER_ID, SCHOOL_ID);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(OrganizationServiceUnavailableError);
  });
});
