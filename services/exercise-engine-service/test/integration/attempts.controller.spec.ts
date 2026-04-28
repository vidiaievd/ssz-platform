import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CqrsModule, CommandBus, QueryBus } from '@nestjs/cqrs';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { AttemptsController } from '../../src/modules/attempts/presentation/controllers/attempts.controller.js';
import { StartAttemptHandler } from '../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { SubmitAnswerHandler } from '../../src/modules/attempts/application/commands/submit-answer/submit-answer.handler.js';
import { AbandonAttemptHandler } from '../../src/modules/attempts/application/commands/abandon-attempt/abandon-attempt.handler.js';
import { GetAttemptByIdHandler } from '../../src/modules/attempts/application/queries/get-attempt-by-id/get-attempt-by-id.handler.js';
import { ListUserAttemptsHandler } from '../../src/modules/attempts/application/queries/list-user-attempts/list-user-attempts.handler.js';
import { ATTEMPT_REPOSITORY } from '../../src/modules/attempts/domain/repositories/attempt.repository.js';
import { CONTENT_CLIENT } from '../../src/shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../src/shared/application/ports/content-client.port.js';
import { ANSWER_VALIDATOR } from '../../src/shared/application/ports/answer-validator.port.js';
import { FEEDBACK_GENERATOR } from '../../src/shared/application/ports/feedback-generator.port.js';
import { LEARNING_CLIENT } from '../../src/shared/application/ports/learning-client.port.js';
import { EVENT_PUBLISHER } from '../../src/shared/application/ports/event-publisher.port.js';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Result } from '../../src/shared/kernel/result.js';
import { Attempt } from '../../src/modules/attempts/domain/entities/attempt.entity.js';

// Bypass auth for controller tests
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
    submittedAnswer: { correct_option_ids: ['A'] },
    validationDetails: null,
    feedback: { summary: 'Correct!' },
    answerHash: 'abc',
    revisionCount: 0,
    startedAt: new Date('2026-01-01T10:00:00Z'),
    submittedAt: new Date('2026-01-01T10:01:00Z'),
    scoredAt: new Date('2026-01-01T10:01:01Z'),
    ...overrides,
  });

const makeDef = () => ({
  exercise: {
    id: 'ex-1',
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'A1',
    content: { question: 'What?' },
    expectedAnswers: { correct_option_ids: ['A'] },
    answerCheckSettings: null,
  },
  template: {
    code: 'multiple_choice',
    contentSchema: {},
    answerSchema: { type: 'object' },
    defaultCheckSettings: {},
    supportedLanguages: null,
  },
  instruction: null,
});

describe('AttemptsController (integration)', () => {
  let app: INestApplication;

  const mockRepo = {
    findById: jest.fn(),
    findInProgress: jest.fn(),
    findAllByUser: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const mockContentClient = { getExerciseForAttempt: jest.fn() };
  const mockValidator = { validate: jest.fn() };
  const mockFeedback = { generate: jest.fn() };
  const mockLearning = { createSubmission: jest.fn() };
  const mockPublisher = { publish: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [AttemptsController],
      providers: [
        StartAttemptHandler, SubmitAnswerHandler, AbandonAttemptHandler,
        GetAttemptByIdHandler, ListUserAttemptsHandler,
        { provide: ATTEMPT_REPOSITORY, useValue: mockRepo },
        { provide: CONTENT_CLIENT, useValue: mockContentClient },
        { provide: ANSWER_VALIDATOR, useValue: mockValidator },
        { provide: FEEDBACK_GENERATOR, useValue: mockFeedback },
        { provide: LEARNING_CLIENT, useValue: mockLearning },
        { provide: EVENT_PUBLISHER, useValue: mockPublisher },
        { provide: APP_GUARD, useValue: mockJwtGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  describe('POST /api/v1/exercises/:exerciseId/attempts', () => {
    it('201 — creates attempt and returns exercise content', async () => {
      mockRepo.findInProgress.mockResolvedValue(null);
      mockContentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeDef()));
      mockRepo.save.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/api/v1/exercises/ex-1/attempts')
        .send({ language: 'no' });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body).toMatchObject({
        templateCode: 'multiple_choice',
        targetLanguage: 'no',
      });
      expect(typeof res.body.attemptId).toBe('string');
    });

    it('404 — when exercise not found', async () => {
      mockRepo.findInProgress.mockResolvedValue(null);
      mockContentClient.getExerciseForAttempt.mockResolvedValue(
        Result.fail(new ContentClientError(404, 'Exercise not found')),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/exercises/missing/attempts')
        .send({ language: 'no' });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('409 — when attempt already in progress', async () => {
      mockRepo.findInProgress.mockResolvedValue(makeAttempt({ status: 'IN_PROGRESS', score: null, passed: null, scoredAt: null, submittedAt: null }));

      const res = await request(app.getHttpServer())
        .post('/api/v1/exercises/ex-1/attempts')
        .send({ language: 'no' });

      expect(res.status).toBe(HttpStatus.CONFLICT);
    });
  });

  describe('POST /api/v1/exercises/:exerciseId/attempts/:attemptId/submit', () => {
    const attemptId = 'a0000000-0000-0000-0000-000000000001';

    it('200 — scores a correct closed-form answer', async () => {
      mockRepo.findById.mockResolvedValue(
        makeAttempt({ id: attemptId, status: 'IN_PROGRESS', score: null, passed: null, scoredAt: null, submittedAt: null }),
      );
      mockContentClient.getExerciseForAttempt.mockResolvedValue(Result.ok(makeDef()));
      mockValidator.validate.mockResolvedValue(Result.ok({ correct: true, score: 100, details: null, requiresReview: false }));
      mockFeedback.generate.mockResolvedValue(Result.ok({ summary: 'Correct!' }));
      mockLearning.createSubmission.mockResolvedValue(Result.ok({ submissionId: 'sub-1' }));

      const res = await request(app.getHttpServer())
        .post(`/api/v1/exercises/ex-1/attempts/${attemptId}/submit`)
        .send({ submittedAnswer: { correct_option_ids: ['A'] }, timeSpentSeconds: 30 });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.correct).toBe(true);
      expect(res.body.score).toBe(100);
      expect(res.body.requiresReview).toBe(false);
    });

    it('404 — attempt not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/exercises/ex-1/attempts/${attemptId}/submit`)
        .send({ submittedAnswer: {}, timeSpentSeconds: 0 });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /api/v1/exercises/:exerciseId/attempts/:attemptId', () => {
    const attemptId = 'a0000000-0000-0000-0000-000000000001';

    it('204 — abandons in-progress attempt', async () => {
      mockRepo.findById.mockResolvedValue(
        makeAttempt({ id: attemptId, status: 'IN_PROGRESS', score: null, passed: null, scoredAt: null, submittedAt: null }),
      );

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/exercises/ex-1/attempts/${attemptId}`);

      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('404 — attempt not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/exercises/ex-1/attempts/${attemptId}`);

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /api/v1/exercises/:exerciseId/attempts/:attemptId', () => {
    const attemptId = 'a0000000-0000-0000-0000-000000000001';

    it('200 — returns attempt details', async () => {
      mockRepo.findById.mockResolvedValue(makeAttempt({ id: attemptId }));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/exercises/ex-1/attempts/${attemptId}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.id).toBe(attemptId);
      expect(res.body.status).toBe('SCORED');
    });

    it('404 — attempt not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/exercises/ex-1/attempts/${attemptId}`);

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('403 — attempt belongs to another user', async () => {
      mockRepo.findById.mockResolvedValue(makeAttempt({ id: attemptId, userId: 'other-user' }));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/exercises/ex-1/attempts/${attemptId}`);

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('GET /api/v1/exercises/:exerciseId/attempts', () => {
    it('200 — returns paginated list', async () => {
      mockRepo.findAllByUser.mockResolvedValue({
        items: [makeAttempt()],
        total: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/exercises/ex-1/attempts');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.total).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('attempt-1');
    });

    it('200 — passes limit and offset to repo', async () => {
      mockRepo.findAllByUser.mockResolvedValue({ items: [], total: 0 });

      await request(app.getHttpServer())
        .get('/api/v1/exercises/ex-1/attempts?limit=5&offset=10');

      expect(mockRepo.findAllByUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ limit: 5, offset: 10 }),
      );
    });

    it('200 — caps limit at 100', async () => {
      mockRepo.findAllByUser.mockResolvedValue({ items: [], total: 0 });

      await request(app.getHttpServer())
        .get('/api/v1/exercises/ex-1/attempts?limit=999');

      expect(mockRepo.findAllByUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ limit: 100 }),
      );
    });
  });
});
