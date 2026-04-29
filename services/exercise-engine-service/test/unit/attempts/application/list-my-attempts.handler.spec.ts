import { jest } from '@jest/globals';
import {
  ListMyAttemptsHandler,
  encodeCursor,
  decodeCursor,
} from '../../../../src/modules/attempts/application/queries/list-my-attempts/list-my-attempts.handler.js';
import { ListMyAttemptsQuery } from '../../../../src/modules/attempts/application/queries/list-my-attempts/list-my-attempts.query.js';
import { Attempt } from '../../../../src/modules/attempts/domain/entities/attempt.entity.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeAttempt = (id: string, startedAt: string) =>
  Attempt.reconstitute({
    id,
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    status: 'SCORED',
    score: 80,
    passed: true,
    timeSpentSeconds: 20,
    submittedAnswer: null,
    validationDetails: null,
    feedback: null,
    answerHash: null,
    revisionCount: 0,
    startedAt: new Date(startedAt),
    submittedAt: null,
    scoredAt: null,
  });

const makeRepo = () => ({
  findByUserWithCursor: jest.fn<() => Promise<{ items: Attempt[]; hasMore: boolean }>>(),
});

const makeHandler = (repo: ReturnType<typeof makeRepo>) =>
  new ListMyAttemptsHandler(repo as any);

// ─── Cursor helpers ───────────────────────────────────────────────────────────

describe('cursor encode/decode round-trip', () => {
  it('encodes and decodes to the same startedAt and id', () => {
    const attempt = makeAttempt('abc-123', '2026-01-15T10:00:00.000Z');
    const cursor = encodeCursor(attempt);
    expect(typeof cursor).toBe('string');

    const decoded = decodeCursor(cursor);
    expect(decoded.id).toBe('abc-123');
    expect(decoded.startedAt.toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('produces a URL-safe base64 string (no +/= characters)', () => {
    const attempt = makeAttempt('some-id', '2026-06-01T00:00:00.000Z');
    const cursor = encodeCursor(attempt);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

// ─── Handler ─────────────────────────────────────────────────────────────────

describe('ListMyAttemptsHandler', () => {
  it('calls repo with userId and filters, returns items', async () => {
    const repo = makeRepo();
    const items = [makeAttempt('a-1', '2026-01-02T00:00:00Z')];
    repo.findByUserWithCursor.mockResolvedValue({ items, hasMore: false });

    const handler = makeHandler(repo);
    const result = await handler.execute(
      new ListMyAttemptsQuery('user-1', 'ex-1', 'SCORED', 20, undefined),
    );

    expect(repo.findByUserWithCursor).toHaveBeenCalledWith('user-1', {
      exerciseId: 'ex-1',
      status: 'SCORED',
      limit: 20,
      cursor: undefined,
    });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(result.limit).toBe(20);
  });

  it('decodes cursor and passes it to repo', async () => {
    const repo = makeRepo();
    repo.findByUserWithCursor.mockResolvedValue({ items: [], hasMore: false });

    const handler = makeHandler(repo);
    const cursorAttempt = makeAttempt('pivot-id', '2026-01-10T12:00:00.000Z');
    const cursor = encodeCursor(cursorAttempt);

    await handler.execute(new ListMyAttemptsQuery('user-1', undefined, undefined, 10, cursor));

    const call = repo.findByUserWithCursor.mock.calls[0] as [string, { cursor: { startedAt: Date; id: string } }];
    expect(call[1].cursor?.id).toBe('pivot-id');
    expect(call[1].cursor?.startedAt.toISOString()).toBe('2026-01-10T12:00:00.000Z');
  });

  it('sets nextCursor from the last item when hasMore=true', async () => {
    const repo = makeRepo();
    const item1 = makeAttempt('first', '2026-01-03T00:00:00Z');
    const item2 = makeAttempt('last', '2026-01-01T00:00:00Z');
    repo.findByUserWithCursor.mockResolvedValue({ items: [item1, item2], hasMore: true });

    const handler = makeHandler(repo);
    const result = await handler.execute(
      new ListMyAttemptsQuery('user-1', undefined, undefined, 2, undefined),
    );

    expect(result.nextCursor).not.toBeNull();
    const decoded = decodeCursor(result.nextCursor!);
    expect(decoded.id).toBe('last');
  });

  it('sets nextCursor to null when hasMore=false', async () => {
    const repo = makeRepo();
    repo.findByUserWithCursor.mockResolvedValue({
      items: [makeAttempt('only', '2026-01-01T00:00:00Z')],
      hasMore: false,
    });

    const handler = makeHandler(repo);
    const result = await handler.execute(
      new ListMyAttemptsQuery('user-1', undefined, undefined, 20, undefined),
    );

    expect(result.nextCursor).toBeNull();
  });

  it('sets nextCursor to null when items list is empty (even if hasMore somehow true)', async () => {
    const repo = makeRepo();
    repo.findByUserWithCursor.mockResolvedValue({ items: [], hasMore: true });

    const handler = makeHandler(repo);
    const result = await handler.execute(
      new ListMyAttemptsQuery('user-1', undefined, undefined, 20, undefined),
    );

    expect(result.nextCursor).toBeNull();
  });
});
