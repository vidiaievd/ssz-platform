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

const makeHandler = (overrides: Partial<{
  repo: IAssignmentRepository;
  contentClient: IContentClient;
  orgClient: IOrganizationClient;
  publisher: IEventPublisher;
  clock: IClock;
}> = {}) => {
  const repo: IAssignmentRepository = overrides.repo ?? {
    findById: jest.fn(),
    findByAssignee: jest.fn(),
    findByAssigner: jest.fn(),
    findOverdueCandidates: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn(),
  };

  const contentClient: IContentClient = overrides.contentClient ?? {
    getContentMetadata: jest.fn(),
    checkVisibilityForUser: jest.fn().mockResolvedValue(Result.ok({ isVisible: true })),
    getAccessTier: jest.fn(),
    getContainerLeafItems: jest.fn(),
  };

  const orgClient: IOrganizationClient = overrides.orgClient ?? {
    getMemberRole: jest.fn()
      .mockResolvedValueOnce(Result.ok('TEACHER'))  // assigner role
      .mockResolvedValueOnce(Result.ok('STUDENT')), // assignee role
  };

  const publisher: IEventPublisher = overrides.publisher ?? {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  const clock: IClock = overrides.clock ?? { now: () => NOW };

  const handler = new CreateAssignmentHandler(repo, contentClient, orgClient, publisher, clock);
  return { handler, repo, contentClient, orgClient, publisher };
};

const makeCommand = (overrides: Partial<ConstructorParameters<typeof CreateAssignmentCommand>[0]> = {}) =>
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
        checkVisibilityForUser: jest.fn().mockResolvedValue(Result.ok({ isVisible: false, reason: 'private' })),
        getAccessTier: jest.fn(),
        getContainerLeafItems: jest.fn(),
      },
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentNotVisibleForAssigneeError);
  });

  it('fails when Content Service is unavailable', async () => {
    const { handler } = makeHandler({
      contentClient: {
        getContentMetadata: jest.fn(),
        checkVisibilityForUser: jest.fn().mockResolvedValue(
          Result.fail(new ContentClientError('timeout')),
        ),
        getAccessTier: jest.fn(),
        getContainerLeafItems: jest.fn(),
      },
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentServiceUnavailableError);
  });

  it('fails when assigner is not a teacher in the school', async () => {
    const { handler } = makeHandler({
      orgClient: {
        getMemberRole: jest.fn()
          .mockResolvedValueOnce(Result.ok('STUDENT')) // assigner is a student, not teacher
          .mockResolvedValueOnce(Result.ok('STUDENT')),
      },
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InsufficientSchoolRoleError);
  });

  it('fails when assignee is not a student in the school', async () => {
    const { handler } = makeHandler({
      orgClient: {
        getMemberRole: jest.fn()
          .mockResolvedValueOnce(Result.ok('TEACHER')) // assigner OK
          .mockResolvedValueOnce(Result.ok('TEACHER')), // assignee is teacher, not student
      },
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InsufficientSchoolRoleError);
  });

  it('fails when Organization Service is unavailable', async () => {
    const { handler } = makeHandler({
      orgClient: {
        getMemberRole: jest.fn().mockResolvedValue(
          Result.fail(new OrganizationClientError('timeout')),
        ),
      },
    });

    const result = await handler.execute(makeCommand());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(OrganizationServiceUnavailableError);
  });

  it('allows OWNER and ADMIN as assigner roles', async () => {
    for (const role of ['OWNER', 'ADMIN'] as const) {
      const { handler } = makeHandler({
        orgClient: {
          getMemberRole: jest.fn()
            .mockResolvedValueOnce(Result.ok(role))
            .mockResolvedValueOnce(Result.ok('STUDENT')),
        },
      });

      const result = await handler.execute(makeCommand());
      expect(result.isOk).toBe(true);
    }
  });
});
