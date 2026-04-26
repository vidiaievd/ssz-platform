import { jest } from '@jest/globals';
import { UpsertProgressHandler } from '../../../../../src/modules/progress/application/commands/upsert-progress.handler.js';
import { UpsertProgressCommand } from '../../../../../src/modules/progress/application/commands/upsert-progress.command.js';
import { InvalidProgressContentRefError } from '../../../../../src/modules/progress/application/errors/progress-application.errors.js';
import type { IProgressRepository } from '../../../../../src/modules/progress/domain/repositories/progress.repository.interface.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';
import { ContentRef } from '../../../../../src/shared/domain/value-objects/content-ref.js';
import { UserProgress } from '../../../../../src/modules/progress/domain/entities/user-progress.entity.js';

const NOW = new Date('2026-03-01T08:00:00Z');
const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const CONTENT_ID = '6c9f93bf-de89-4c60-b6d4-a4eed80096a7';

const mockFn = () => jest.fn<() => Promise<unknown>>();

const makeHandler = (overrides: Partial<{
  repo: IProgressRepository;
  publisher: IEventPublisher;
  clock: IClock;
}> = {}) => {
  const repo = (overrides.repo ?? {
    findByUserAndContent: mockFn().mockResolvedValue(null),
    findByUser: jest.fn(),
    findByAssignment: jest.fn(),
    save: mockFn().mockResolvedValue(undefined),
  }) as unknown as IProgressRepository;

  const publisher = (overrides.publisher ?? {
    publish: mockFn().mockResolvedValue(undefined),
  }) as unknown as IEventPublisher;

  const clock: IClock = overrides.clock ?? { now: () => NOW };

  return { handler: new UpsertProgressHandler(repo, publisher, clock), repo, publisher };
};

const makeCmd = (overrides: Partial<{
  contentType: string;
  completed: boolean;
  score: number | null;
}> = {}) =>
  new UpsertProgressCommand(
    USER_ID,
    overrides.contentType ?? 'LESSON',
    CONTENT_ID,
    120,
    overrides.score ?? null,
    overrides.completed ?? false,
  );

describe('UpsertProgressHandler', () => {
  it('creates a new progress record when none exists and returns dto', async () => {
    const { handler, repo, publisher } = makeHandler();

    const result = await handler.execute(makeCmd());

    expect(result.isOk).toBe(true);
    expect(result.value.userId).toBe(USER_ID);
    expect(result.value.contentRef.id).toBe(CONTENT_ID);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('updates an existing progress record when found', async () => {
    const existing = UserProgress.create(USER_ID, ContentRef.fromPersistence('LESSON', CONTENT_ID));
    const { handler, repo } = makeHandler({
      repo: {
        findByUserAndContent: mockFn().mockResolvedValue(existing),
        findByUser: jest.fn(),
        findByAssignment: jest.fn(),
        save: mockFn().mockResolvedValue(undefined),
      } as unknown as IProgressRepository,
    });

    const result = await handler.execute(makeCmd());

    expect(result.isOk).toBe(true);
    expect(result.value.attemptsCount).toBe(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('fails on invalid content type', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(makeCmd({ contentType: 'INVALID' }));

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidProgressContentRefError);
  });

  it('publishes ProgressCompletedEvent on first completion', async () => {
    const { handler, publisher } = makeHandler();

    const result = await handler.execute(makeCmd({ completed: true, score: 1.0 }));

    expect(result.isOk).toBe(true);
    expect(publisher.publish).toHaveBeenCalledWith(
      'learning.progress.completed',
      expect.any(Object),
    );
  });

  it('publishes ProgressUpdatedEvent on non-completing attempt', async () => {
    const existing = UserProgress.create(USER_ID, ContentRef.fromPersistence('LESSON', CONTENT_ID));
    existing.recordAttempt({ timeSpentSeconds: 30, score: 1, completed: true, now: new Date('2026-01-01T00:00:00Z') });
    existing.clearDomainEvents();

    const { handler, publisher } = makeHandler({
      repo: {
        findByUserAndContent: mockFn().mockResolvedValue(existing),
        findByUser: jest.fn(),
        findByAssignment: jest.fn(),
        save: mockFn().mockResolvedValue(undefined),
      } as unknown as IProgressRepository,
    });

    await handler.execute(makeCmd({ completed: false }));

    expect(publisher.publish).toHaveBeenCalledWith(
      'learning.progress.updated',
      expect.any(Object),
    );
  });
});
