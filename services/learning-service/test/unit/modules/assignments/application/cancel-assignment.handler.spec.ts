import { jest } from '@jest/globals';
import { CancelAssignmentHandler } from '../../../../../src/modules/assignments/application/commands/cancel-assignment.handler.js';
import { CancelAssignmentCommand } from '../../../../../src/modules/assignments/application/commands/cancel-assignment.command.js';
import {
  AssignmentForbiddenError,
  AssignmentNotFoundError,
  AssignmentDomainValidationError,
} from '../../../../../src/modules/assignments/application/errors/assignment-application.errors.js';
import { Assignment } from '../../../../../src/modules/assignments/domain/entities/assignment.entity.js';
import { ContentRef } from '../../../../../src/shared/domain/value-objects/content-ref.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import type { IAssignmentRepository } from '../../../../../src/modules/assignments/domain/repositories/assignment.repository.interface.js';
import type { IOrganizationClient } from '../../../../../src/shared/application/ports/organization-client.port.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';

const ASSIGNER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ASSIGNEE_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const SCHOOL_ID   = 'cccccccc-0000-4000-8000-000000000003';
const CONTENT_ID  = 'dddddddd-0000-4000-8000-000000000004';
const NOW  = new Date('2026-01-01T12:00:00Z');
const FUTURE = new Date('2026-06-01T12:00:00Z');

const contentRef = ContentRef.create('LESSON', CONTENT_ID).value;

const makeActiveAssignment = () =>
  Assignment.reconstitute({
    id: 'eeeeeeee-0000-4000-8000-000000000005',
    assignerId: ASSIGNER_ID,
    assigneeId: ASSIGNEE_ID,
    schoolId: SCHOOL_ID,
    contentRef,
    status: 'ACTIVE',
    assignedAt: NOW,
    dueAt: FUTURE,
    completedAt: null,
    cancelledAt: null,
    cancelledReason: null,
    notes: null,
    deletedAt: null,
  });

const makeHandler = (
  assignment: ReturnType<typeof makeActiveAssignment> | null,
  orgClientRole: string | null = null,
) => {
  const repo: IAssignmentRepository = {
    findById: jest.fn().mockResolvedValue(assignment),
    findByAssignee: jest.fn(),
    findByAssigner: jest.fn(),
    findOverdueCandidates: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn(),
  };

  const orgClient: IOrganizationClient = {
    getMemberRole: jest.fn().mockResolvedValue(Result.ok(orgClientRole)),
  };

  const publisher: IEventPublisher = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  return { handler: new CancelAssignmentHandler(repo, orgClient, publisher), repo, publisher };
};

describe('CancelAssignmentHandler', () => {
  it('cancels when requesting user is the assigner', async () => {
    const { handler, repo, publisher } = makeHandler(makeActiveAssignment());
    const cmd = new CancelAssignmentCommand('eeeeeeee-0000-4000-8000-000000000005', ASSIGNER_ID, [], 'no longer needed');

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.status).toBe('CANCELLED');
    expect(result.value.cancelledReason).toBe('no longer needed');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith('learning.assignment.cancelled', expect.any(Object));
  });

  it('cancels when requesting user is a school admin', async () => {
    const { handler } = makeHandler(makeActiveAssignment(), 'ADMIN');
    const cmd = new CancelAssignmentCommand('eeeeeeee-0000-4000-8000-000000000005', 'other-user-id', []);

    const result = await handler.execute(cmd);
    expect(result.isOk).toBe(true);
  });

  it('cancels when requesting user is a platform admin', async () => {
    const { handler } = makeHandler(makeActiveAssignment());
    const cmd = new CancelAssignmentCommand('eeeeeeee-0000-4000-8000-000000000005', 'other-user-id', ['platform_admin']);

    const result = await handler.execute(cmd);
    expect(result.isOk).toBe(true);
  });

  it('returns not found when assignment does not exist', async () => {
    const { handler } = makeHandler(null);
    const cmd = new CancelAssignmentCommand('missing-id', ASSIGNER_ID, []);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AssignmentNotFoundError);
  });

  it('returns forbidden when user has no authority', async () => {
    const { handler } = makeHandler(makeActiveAssignment(), 'STUDENT');
    const cmd = new CancelAssignmentCommand('eeeeeeee-0000-4000-8000-000000000005', 'other-user-id', []);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AssignmentForbiddenError);
  });

  it('returns domain validation error when assignment is already cancelled', async () => {
    const a = makeActiveAssignment();
    a.cancel();
    a.clearDomainEvents();

    const { handler } = makeHandler(a);
    const cmd = new CancelAssignmentCommand('eeeeeeee-0000-4000-8000-000000000005', ASSIGNER_ID, []);

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AssignmentDomainValidationError);
  });
});
