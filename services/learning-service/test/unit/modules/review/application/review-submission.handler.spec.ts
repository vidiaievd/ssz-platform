import { jest } from '@jest/globals';
import { ReviewSubmissionHandler } from '../../../../../src/modules/review/application/commands/review-submission.handler.js';
import { ReviewSubmissionCommand } from '../../../../../src/modules/review/application/commands/review-submission.command.js';
import {
  SubmissionNotFoundError,
  ReviewerNotAuthorizedError,
  OrganizationServiceUnavailableError,
  SubmissionDomainValidationError,
} from '../../../../../src/modules/review/application/errors/review-application.errors.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import { OrganizationClientError } from '../../../../../src/shared/application/ports/organization-client.port.js';
import { Submission } from '../../../../../src/modules/review/domain/entities/submission.entity.js';
import type { ISubmissionRepository } from '../../../../../src/modules/review/domain/repositories/submission.repository.interface.js';
import type { IOrganizationClient } from '../../../../../src/shared/application/ports/organization-client.port.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';

const NOW = new Date('2026-03-15T12:00:00Z');
const SUB_ID = 'sub-aaa';
const REVIEWER_ID = 'rev-bbb';
const SCHOOL_ID = 'school-ccc';

const mockFn = () => jest.fn<() => Promise<unknown>>();

function pendingSubmission(): Submission {
  return Submission.submit(
    { userId: 'student-001', exerciseId: 'ex-001', content: { text: 'answer' }, schoolId: SCHOOL_ID },
    new Date('2026-03-01T00:00:00Z'),
  );
}

function approvedSubmission(): Submission {
  const s = pendingSubmission();
  s.review('rev', 'APPROVED', null, null, new Date('2026-03-02T00:00:00Z'));
  s.clearDomainEvents();
  return s;
}

const makeHandler = (overrides: Partial<{
  repo: ISubmissionRepository;
  orgClient: IOrganizationClient;
  publisher: IEventPublisher;
  clock: IClock;
  commandBus: { execute: (cmd: unknown) => Promise<unknown> };
}> = {}) => {
  const repo = (overrides.repo ?? {
    findById: mockFn().mockResolvedValue(pendingSubmission()),
    findByUser: jest.fn(),
    findByExercise: jest.fn(),
    findPendingForSchool: jest.fn(),
    save: mockFn().mockResolvedValue(undefined),
  }) as unknown as ISubmissionRepository;

  const orgClient = (overrides.orgClient ?? {
    getMemberRole: mockFn().mockResolvedValue(Result.ok('TEACHER')),
  }) as unknown as IOrganizationClient;

  const publisher = (overrides.publisher ?? {
    publish: mockFn().mockResolvedValue(undefined),
  }) as unknown as IEventPublisher;

  const clock: IClock = overrides.clock ?? { now: () => NOW };

  const commandBus = overrides.commandBus ?? {
    execute: mockFn().mockResolvedValue(undefined),
  };

  const handler = new ReviewSubmissionHandler(
    repo,
    orgClient,
    publisher,
    clock,
    commandBus as any,
  );

  return { handler, repo, orgClient, publisher, commandBus };
};

const makeCmd = (overrides: Partial<{
  submissionId: string;
  reviewerRoles: string[];
  decision: string;
}> = {}) =>
  new ReviewSubmissionCommand(
    overrides.submissionId ?? SUB_ID,
    REVIEWER_ID,
    overrides.reviewerRoles ?? ['tutor'],
    overrides.decision ?? 'APPROVED',
    'looks good',
    1.0,
  );

describe('ReviewSubmissionHandler', () => {
  it('returns SubmissionNotFoundError when submission does not exist', async () => {
    const { handler } = makeHandler({
      repo: {
        findById: mockFn().mockResolvedValue(null),
        findByUser: jest.fn(),
        findByExercise: jest.fn(),
        findPendingForSchool: jest.fn(),
        save: mockFn().mockResolvedValue(undefined),
      } as unknown as ISubmissionRepository,
    });

    const result = await handler.execute(makeCmd());

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SubmissionNotFoundError);
  });

  it('platform_admin bypasses org role check', async () => {
    const { handler, orgClient } = makeHandler();

    const result = await handler.execute(makeCmd({ reviewerRoles: ['platform_admin'] }));

    expect(result.isOk).toBe(true);
    expect(orgClient.getMemberRole).not.toHaveBeenCalled();
  });

  it('returns ReviewerNotAuthorizedError when submission has no school and reviewer is not platform_admin', async () => {
    const noSchoolSub = Submission.submit(
      { userId: 'student-x', exerciseId: 'ex-x', content: { text: 'answer' } },
      NOW,
    );
    const { handler } = makeHandler({
      repo: {
        findById: mockFn().mockResolvedValue(noSchoolSub),
        findByUser: jest.fn(),
        findByExercise: jest.fn(),
        findPendingForSchool: jest.fn(),
        save: mockFn().mockResolvedValue(undefined),
      } as unknown as ISubmissionRepository,
    });

    const result = await handler.execute(makeCmd({ reviewerRoles: ['tutor'] }));

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ReviewerNotAuthorizedError);
  });

  it('returns OrganizationServiceUnavailableError when org client fails', async () => {
    const { handler } = makeHandler({
      orgClient: {
        getMemberRole: mockFn().mockResolvedValue(Result.fail(new OrganizationClientError('timeout'))),
      } as unknown as IOrganizationClient,
    });

    const result = await handler.execute(makeCmd({ reviewerRoles: ['tutor'] }));

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(OrganizationServiceUnavailableError);
  });

  it('returns ReviewerNotAuthorizedError when reviewer role is STUDENT', async () => {
    const { handler } = makeHandler({
      orgClient: {
        getMemberRole: mockFn().mockResolvedValue(Result.ok('STUDENT')),
      } as unknown as IOrganizationClient,
    });

    const result = await handler.execute(makeCmd({ reviewerRoles: ['tutor'] }));

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(ReviewerNotAuthorizedError);
  });

  it('approves submission, saves, publishes event, and dispatches ResolveReviewCommand', async () => {
    const { handler, repo, publisher, commandBus } = makeHandler();

    const result = await handler.execute(makeCmd({ decision: 'APPROVED' }));

    expect(result.isOk).toBe(true);
    expect(result.value.status).toBe('APPROVED');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith('learning.submission.reviewed', expect.any(Object));
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ approved: true }),
    );
  });

  it('dispatches MarkNeedsReviewCommand on REVISION_REQUESTED decision', async () => {
    const { handler, commandBus } = makeHandler();

    await handler.execute(makeCmd({ decision: 'REVISION_REQUESTED' }));

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'EXERCISE' }),
    );
    // MarkNeedsReviewCommand does not have 'approved' property
    const call = (commandBus.execute as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect('approved' in call).toBe(false);
  });

  it('returns SubmissionDomainValidationError when domain rejects the review', async () => {
    const { handler } = makeHandler({
      repo: {
        findById: mockFn().mockResolvedValue(approvedSubmission()),
        findByUser: jest.fn(),
        findByExercise: jest.fn(),
        findPendingForSchool: jest.fn(),
        save: mockFn().mockResolvedValue(undefined),
      } as unknown as ISubmissionRepository,
    });

    const result = await handler.execute(makeCmd({ reviewerRoles: ['platform_admin'], decision: 'APPROVED' }));

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(SubmissionDomainValidationError);
  });

  it('swallows progress sync errors silently', async () => {
    const { handler } = makeHandler({
      commandBus: {
        execute: jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('progress not found')),
      },
    });

    const result = await handler.execute(makeCmd());

    expect(result.isOk).toBe(true);
  });
});
