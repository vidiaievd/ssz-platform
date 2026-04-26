import { jest } from '@jest/globals';
import { CreateAssignmentHandler } from '../../../../../src/modules/assignments/application/commands/create-assignment.handler.js';
import { CreateAssignmentCommand } from '../../../../../src/modules/assignments/application/commands/create-assignment.command.js';
import {
  ContentNotVisibleForAssigneeError,
  ContentServiceUnavailableError,
  InsufficientSchoolRoleError,
  InvalidContentRefError,
  OrganizationServiceUnavailableError,
} from '../../../../../src/modules/assignments/application/errors/assignment-application.errors.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import { ContentClientError } from '../../../../../src/shared/application/ports/content-client.port.js';
import { OrganizationClientError } from '../../../../../src/shared/application/ports/organization-client.port.js';
import type { IAssignmentRepository } from '../../../../../src/modules/assignments/domain/repositories/assignment.repository.interface.js';
import type { IContentClient } from '../../../../../src/shared/application/ports/content-client.port.js';
import type { IOrganizationClient } from '../../../../../src/shared/application/ports/organization-client.port.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';

const ASSIGNER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ASSIGNEE_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const SCHOOL_ID   = 'cccccccc-0000-4000-8000-000000000003';
const CONTENT_ID  = 'dddddddd-0000-4000-8000-000000000004';
const NOW  = new Date('2026-01-01T12:00:00Z');
const FUTURE = new Date('2026-06-01T12:00:00Z');

// jest.fn typed as returning Promise<unknown> so mockResolvedValue accepts any value
const mockFn = () => jest.fn<() => Promise<unknown>>();

const makeHandler = (overrides: Partial<{
  repo: IAssignmentRepository;
  contentClient: IContentClient;
  orgClient: IOrganizationClient;
  publisher: IEventPublisher;
  clock: IClock;
}> = {}) => {
  const repo = (overrides.repo ?? {
    findById: jest.fn(),
    findByAssignee: jest.fn(),
    findByAssigner: jest.fn(),
    findOverdueCandidates: jest.fn(),
    save: mockFn().mockResolvedValue(undefined),
    softDelete: jest.fn(),
  }) as unknown as IAssignmentRepository;

  const contentClient = (overrides.contentClient ?? {
    getContentMetadata: jest.fn(),
    checkVisibilityForUser: mockFn().mockResolvedValue(Result.ok({ isVisible: true })),
    getAccessTier: jest.fn(),
    getContainerLeafItems: jest.fn(),
  }) as unknown as IContentClient;

  const orgClient = (overrides.orgClient ?? {
    getMemberRole: mockFn()
      .mockResolvedValueOnce(Result.ok('TEACHER'))
      .mockResolvedValueOnce(Result.ok('STUDENT')),
  }) as unknown as IOrganizationClient;

  const publisher = (overrides.publisher ?? {
    publish: mockFn().mockResolvedValue(undefined),
  }) as unknown as IEventPublisher;

  const clock: IClock = overrides.clock ?? { now: () => NOW };

  const handler = new CreateAssignmentHandler(repo, contentClient, orgClient, publisher, clock);
  return { handler, repo, contentClient, orgClient, publisher };
};

const makeCommand = () =>
  new CreateAssignmentCommand(
    ASSIGNER_ID,
    ASSIGNEE_ID,
    SCHOOL_ID,
    'LESSON',
    CONTENT_ID,
    FUTURE,
    undefined,
  );

describe('CreateAssignmentHandler', () => {
  it('creates assignment and returns dto on happy path', async () => {
    const { handler, repo, publisher } = makeHandler();

    const result = await handler.execute(makeCommand());

    expect(result.isOk).toBe(true);
    expect(result.value.assignerId).toBe(ASSIGNER_ID);
    expect(result.value.assigneeId).toBe(ASSIGNEE_ID);
    expect(result.value.status).toBe('ACTIVE');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith('learning.assignment.created', expect.any(Object));
  });

  it('fails on invalid content ref type', async () => {
    const { handler } = makeHandler();
    const cmd = new CreateAssignmentCommand(ASSIGNER_ID, ASSIGNEE_ID, SCHOOL_ID, 'INVALID_TYPE', CONTENT_ID, FUTURE);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidContentRefError);
  });

  it('fails when content is not visible to assignee', async () => {
    const { handler } = makeHandler({
      contentClient: {
        getContentMetadata: jest.fn(),
        checkVisibilityForUser: mockFn().mockResolvedValue(Result.ok({ isVisible: false, reason: 'private' })),
        getAccessTier: jest.fn(),
        getContainerLeafItems: jest.fn(),
      } as unknown as IContentClient,
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentNotVisibleForAssigneeError);
  });

  it('fails when Content Service is unavailable', async () => {
    const { handler } = makeHandler({
      contentClient: {
        getContentMetadata: jest.fn(),
        checkVisibilityForUser: mockFn().mockResolvedValue(Result.fail(new ContentClientError('timeout'))),
        getAccessTier: jest.fn(),
        getContainerLeafItems: jest.fn(),
      } as unknown as IContentClient,
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentServiceUnavailableError);
  });

  it('fails when assigner is not a teacher in the school', async () => {
    const { handler } = makeHandler({
      orgClient: {
        getMemberRole: mockFn()
          .mockResolvedValueOnce(Result.ok('STUDENT'))
          .mockResolvedValueOnce(Result.ok('STUDENT')),
      } as unknown as IOrganizationClient,
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InsufficientSchoolRoleError);
  });

  it('fails when assignee is not a student in the school', async () => {
    const { handler } = makeHandler({
      orgClient: {
        getMemberRole: mockFn()
          .mockResolvedValueOnce(Result.ok('TEACHER'))
          .mockResolvedValueOnce(Result.ok('TEACHER')),
      } as unknown as IOrganizationClient,
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InsufficientSchoolRoleError);
  });

  it('fails when Organization Service is unavailable', async () => {
    const { handler } = makeHandler({
      orgClient: {
        getMemberRole: mockFn().mockResolvedValue(Result.fail(new OrganizationClientError('timeout'))),
      } as unknown as IOrganizationClient,
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(OrganizationServiceUnavailableError);
  });

  it('allows OWNER and ADMIN as assigner roles', async () => {
    for (const role of ['OWNER', 'ADMIN'] as const) {
      const { handler } = makeHandler({
        orgClient: {
          getMemberRole: mockFn()
            .mockResolvedValueOnce(Result.ok(role))
            .mockResolvedValueOnce(Result.ok('STUDENT')),
        } as unknown as IOrganizationClient,
      });

      const result = await handler.execute(makeCommand());
      expect(result.isOk).toBe(true);
    }
  });
});
