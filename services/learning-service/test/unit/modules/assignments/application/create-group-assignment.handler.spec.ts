import { jest } from '@jest/globals';
import { CreateGroupAssignmentHandler } from '../../../../../src/modules/assignments/application/commands/create-group-assignment/create-group-assignment.handler.js';
import { CreateGroupAssignmentCommand } from '../../../../../src/modules/assignments/application/commands/create-group-assignment/create-group-assignment.command.js';
import {
  ContentServiceUnavailableError,
  InsufficientSchoolRoleError,
} from '../../../../../src/modules/assignments/application/errors/assignment-application.errors.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import { ContentClientError } from '../../../../../src/shared/application/ports/content-client.port.js';
import type { IAssignmentRepository } from '../../../../../src/modules/assignments/domain/repositories/assignment.repository.interface.js';
import type { IContentClient } from '../../../../../src/shared/application/ports/content-client.port.js';
import type { IOrganizationClient } from '../../../../../src/shared/application/ports/organization-client.port.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';

const ASSIGNER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const SCHOOL_ID = 'cccccccc-0000-4000-8000-000000000003';
const GROUP_ID = 'dddddddd-0000-4000-8000-000000000004';
const CONTENT_ID = 'eeeeeeee-0000-4000-8000-000000000005';
const STUDENT_A = 'ffffffff-0000-4000-8000-000000000006';
const STUDENT_B = 'ffffffff-0000-4000-8000-000000000007';
const NOW = new Date('2026-01-01T12:00:00Z');
const DUE = new Date('2026-06-01T12:00:00Z');

const mockFn = () => jest.fn<() => Promise<unknown>>();

const makeHandler = (
  overrides: Partial<{
    assignerRole: string | null;
    memberIds: string[];
    visibility: unknown;
  }> = {},
) => {
  const {
    assignerRole = 'TEACHER',
    memberIds = [STUDENT_A, STUDENT_B],
    visibility = Result.ok({ isVisible: true }),
  } = overrides;

  const repo = {
    findById: jest.fn(),
    findByAssignee: jest.fn(),
    findByAssigner: jest.fn(),
    findOverdueCandidates: jest.fn(),
    save: mockFn().mockResolvedValue(undefined),
    softDelete: jest.fn(),
  } as unknown as IAssignmentRepository;

  const contentClient = {
    getContentMetadata: jest.fn(),
    checkVisibilityForUser: mockFn().mockResolvedValue(visibility),
    getAccessTier: jest.fn(),
    getContainerLeafItems: jest.fn(),
  } as unknown as IContentClient;

  const orgClient = {
    getMemberRole: mockFn().mockResolvedValue(Result.ok(assignerRole)),
    getGroupMemberIds: mockFn().mockResolvedValue(Result.ok(memberIds)),
  } as unknown as IOrganizationClient;

  const publisher = { publish: mockFn().mockResolvedValue(undefined) } as unknown as IEventPublisher;
  const clock: IClock = { now: () => NOW };

  return {
    handler: new CreateGroupAssignmentHandler(repo, contentClient, orgClient, publisher, clock),
    repo,
  };
};

const command = () =>
  new CreateGroupAssignmentCommand(
    ASSIGNER_ID,
    SCHOOL_ID,
    GROUP_ID,
    'EXERCISE',
    CONTENT_ID,
    DUE,
    undefined,
  );

describe('CreateGroupAssignmentHandler', () => {
  it('assigns the content to every member of the group', async () => {
    const { handler, repo } = makeHandler();

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    expect(result.value).toHaveLength(2);
    expect(repo.save).toHaveBeenCalledTimes(2);
  });

  // The owner of a school is not on its roster — ownership lives on the school itself —
  // and the role lookup now says OWNER for them. Assigning homework to your own group is
  // not something an owner should be refused.
  it('lets the school owner assign', async () => {
    const { handler } = makeHandler({ assignerRole: 'OWNER' });

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
  });

  it('refuses somebody who is only a student of the school', async () => {
    const { handler } = makeHandler({ assignerRole: 'STUDENT' });

    const result = await handler.execute(command());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InsufficientSchoolRoleError);
  });

  // A learner the content is genuinely not visible to is skipped, and the rest still get
  // their assignment: that is a fact about one person.
  it('skips a learner the content is not visible to', async () => {
    const { handler, repo } = makeHandler({
      visibility: Result.ok({ isVisible: false, reason: 'private' }),
    });

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    expect(result.value).toHaveLength(0);
    expect(repo.save).not.toHaveBeenCalled();
  });

  // But a content service that could not answer is not a fact about anybody. Folding the
  // two together returned "201, nobody assigned" — which is what happened live when the
  // visibility route turned out not to exist at all.
  it('fails loudly when the content service cannot answer', async () => {
    const { handler, repo } = makeHandler({
      visibility: Result.fail(new ContentClientError('404 Not Found')),
    });

    const result = await handler.execute(command());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ContentServiceUnavailableError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
