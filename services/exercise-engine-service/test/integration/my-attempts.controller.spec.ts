import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { MyAttemptsController } from '../../src/modules/attempts/presentation/controllers/my-attempts.controller.js';
import { GetAttemptByIdHandler } from '../../src/modules/attempts/application/queries/get-attempt-by-id/get-attempt-by-id.handler.js';
import { ListMyAttemptsHandler, encodeCursor } from '../../src/modules/attempts/application/queries/list-my-attempts/list-my-attempts.handler.js';
import { ATTEMPT_REPOSITORY } from '../../src/modules/attempts/domain/repositories/attempt.repository.js';
import { Attempt } from '../../src/modules/attempts/domain/entities/attempt.entity.js';

const mockJwtGuard: CanActivate = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = { userId: 'user-1', roles: ['student'], isPlatformAdmin: false };
    return true;
  },
};

const makeAttempt = (overrides: Record<string, unknown> = {}) =>
  Attempt.reconstitute({
    id: 'attempt-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    status: 'SCORED',
    score: 100,
    passed: true,
    timeSpentSeconds: 30,
    submittedAnswer: null,
    validationDetails: null,
    feedback: { summary: 'Correct!' },
    answerHash: null,
    revisionCount: 0,
    startedAt: new Date('2026-01-01T10:00:00Z'),
    submittedAt: new Date('2026-01-01T10:01:00Z'),
    scoredAt: new Date('2026-01-01T10:01:01Z'),
    ...overrides,
  });

describe('MyAttemptsController (integration)', () => {
  let app: INestApplication;

  const mockRepo = {
    findById: jest.fn(),
    findByUserWithCursor: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [MyAttemptsController],
      providers: [
        GetAttemptByIdHandler,
        ListMyAttemptsHandler,
        { provide: ATTEMPT_REPOSITORY, useValue: mockRepo },
        { provide: APP_GUARD, useValue: mockJwtGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  // ─── GET /api/v1/attempts/:attemptId ────────────────────────────────────────

  describe('GET /api/v1/attempts/:attemptId', () => {
    const attemptId = 'a0000000-0000-0000-0000-000000000001';

    it('200 — returns attempt details for the owner', async () => {
      mockRepo.findById.mockResolvedValue(makeAttempt({ id: attemptId }));

      const res = await request(app.getHttpServer()).get(`/api/v1/attempts/${attemptId}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.id).toBe(attemptId);
      expect(res.body.status).toBe('SCORED');
      expect(res.body.score).toBe(100);
    });

    it('404 — attempt not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer()).get(`/api/v1/attempts/${attemptId}`);

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('403 — attempt belongs to another user', async () => {
      mockRepo.findById.mockResolvedValue(makeAttempt({ id: attemptId, userId: 'other-user' }));

      const res = await request(app.getHttpServer()).get(`/api/v1/attempts/${attemptId}`);

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('400 — non-UUID attemptId rejected', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/attempts/not-a-uuid');

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  // ─── GET /api/v1/attempts/me ─────────────────────────────────────────────────

  describe('GET /api/v1/attempts/me', () => {
    it('200 — returns list of attempts with null nextCursor when no more pages', async () => {
      mockRepo.findByUserWithCursor.mockResolvedValue({
        items: [makeAttempt()],
        hasMore: false,
      });

      const res = await request(app.getHttpServer()).get('/api/v1/attempts/me');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('attempt-1');
      expect(res.body.nextCursor).toBeNull();
      expect(res.body.limit).toBe(20);
    });

    it('200 — returns nextCursor when hasMore=true', async () => {
      const lastItem = makeAttempt({ id: 'last-id', startedAt: new Date('2026-01-01T08:00:00Z') });
      mockRepo.findByUserWithCursor.mockResolvedValue({
        items: [makeAttempt(), lastItem],
        hasMore: true,
      });

      const res = await request(app.getHttpServer()).get('/api/v1/attempts/me?limit=2');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.nextCursor).toBeTruthy();
      expect(typeof res.body.nextCursor).toBe('string');
    });

    it('200 — passes exerciseId and status filters to repo', async () => {
      mockRepo.findByUserWithCursor.mockResolvedValue({ items: [], hasMore: false });

      await request(app.getHttpServer()).get(
        '/api/v1/attempts/me?exerciseId=ex-42&status=SCORED&limit=5',
      );

      expect(mockRepo.findByUserWithCursor).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ exerciseId: 'ex-42', status: 'SCORED', limit: 5 }),
      );
    });

    it('200 — caps limit at 100', async () => {
      mockRepo.findByUserWithCursor.mockResolvedValue({ items: [], hasMore: false });

      await request(app.getHttpServer()).get('/api/v1/attempts/me?limit=999');

      expect(mockRepo.findByUserWithCursor).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('200 — forwards cursor to repo when provided', async () => {
      mockRepo.findByUserWithCursor.mockResolvedValue({ items: [], hasMore: false });

      const cursorAttempt = makeAttempt({ id: 'pivot', startedAt: new Date('2026-01-05T00:00:00Z') });
      const cursor = encodeCursor(cursorAttempt);

      await request(app.getHttpServer()).get(`/api/v1/attempts/me?cursor=${cursor}`);

      const call = mockRepo.findByUserWithCursor.mock.calls[0] as [string, { cursor: { id: string } }];
      expect(call[1].cursor?.id).toBe('pivot');
    });

    it('200 — /me is not captured by /:attemptId pattern', async () => {
      mockRepo.findByUserWithCursor.mockResolvedValue({ items: [], hasMore: false });

      const res = await request(app.getHttpServer()).get('/api/v1/attempts/me');

      // If 'me' was treated as an attemptId UUID, ParseUUIDPipe would return 400.
      expect(res.status).toBe(HttpStatus.OK);
    });
  });
});
