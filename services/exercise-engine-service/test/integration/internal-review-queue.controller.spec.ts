import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { InternalReviewController } from '../../src/modules/attempts/presentation/controllers/internal-review.controller.js';
import { ListReviewQueueV2Handler } from '../../src/modules/attempts/application/queries/list-review-queue-v2/list-review-queue-v2.handler.js';
import { CountReviewQueueHandler } from '../../src/modules/attempts/application/queries/count-review-queue/count-review-queue.handler.js';
import { encodeReviewQueueCursor } from '../../src/modules/attempts/application/queries/list-review-queue-v2/review-queue-cursor.js';
import { ATTEMPT_REPOSITORY } from '../../src/modules/attempts/domain/repositories/attempt.repository.js';
import { Attempt } from '../../src/modules/attempts/domain/entities/attempt.entity.js';

const INTERNAL_TOKEN = 'internal-test-token';

const waiting = (id: string, exerciseId: string, userId: string, submittedAt: string): Attempt =>
  Attempt.reconstitute({
    id,
    userId,
    exerciseId,
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'short_answer',
    targetLanguage: 'no',
    difficultyLevel: 'A2',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'ROUTED_FOR_REVIEW',
    score: null,
    passed: null,
    timeSpentSeconds: 45,
    submittedAnswer: [{ itemId: 'i1', text: 'Jeg drakk kaffe.' }],
    validationDetails: null,
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date(submittedAt),
    submittedAt: new Date(submittedAt),
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    reviewDecisions: null,
    schoolId: 'school-1',
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: { course: 'Ny i Norge A2', module: 'Leksjon 7', exercise: 'Perfektum' },
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
  });

describe('InternalReviewController — scoped queue (integration)', () => {
  let app: INestApplication;

  const mockRepo = {
    findReviewQueuePage: jest.fn(),
    summariseReviewQueue: jest.fn(),
  };

  const post = (path: string, body: unknown) =>
    request(app.getHttpServer())
      .post(path)
      .set('x-internal-token', INTERNAL_TOKEN)
      .send(body as object);

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findReviewQueuePage.mockResolvedValue([]);
    mockRepo.summariseReviewQueue.mockResolvedValue({ pending: 0, oldestSubmittedAt: null });

    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [InternalReviewController],
      providers: [
        ListReviewQueueV2Handler,
        CountReviewQueueHandler,
        { provide: ATTEMPT_REPOSITORY, useValue: mockRepo },
        { provide: ConfigService, useValue: { get: () => INTERNAL_TOKEN } },
      ],
    }).compile();

    app = module.createNestApplication();
    // The global pipe exactly as main.ts configures it: the scope rules below are the
    // controller's own, and they have to hold with this pipe in front of them.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(() => app.close());

  it('401 — without the internal token', async () => {
    await request(app.getHttpServer())
      .post('/internal/attempts/review/queue')
      .send({ schoolId: 'school-1', groupIds: ['group-1'] })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('422 — a queue asked for without a school', async () => {
    await post('/internal/attempts/review/queue', { groupIds: ['group-1'] }).expect(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    expect(mockRepo.findReviewQueuePage).not.toHaveBeenCalled();
  });

  it('422 — a school alone, with neither groups nor courses to narrow it', async () => {
    await post('/internal/attempts/review/queue', { schoolId: 'school-1' }).expect(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('422 — a cursor this service did not issue', async () => {
    await post('/internal/attempts/review/queue', {
      schoolId: 'school-1',
      groupIds: ['group-1'],
      cursor: 'made-up',
    }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('groups the page by exercise, oldest group first, and pages by cursor', async () => {
    mockRepo.findReviewQueuePage.mockResolvedValue([
      waiting('a1', 'ex-2', 'u1', '2026-08-10T08:00:00Z'),
      waiting('a2', 'ex-1', 'u2', '2026-08-11T08:00:00Z'),
      waiting('a3', 'ex-2', 'u3', '2026-08-12T08:00:00Z'),
    ]);
    mockRepo.summariseReviewQueue.mockResolvedValue({
      pending: 27,
      oldestSubmittedAt: new Date('2026-08-10T08:00:00Z'),
    });

    const res = await post('/internal/attempts/review/queue', {
      schoolId: 'school-1',
      groupIds: ['group-1', 'group-1'],
      containerIds: ['course-1'],
      templateCodes: ['short_answer'],
      limit: 2,
    }).expect(HttpStatus.CREATED);

    // Duplicates in the scope collapse before they reach the query.
    expect(mockRepo.findReviewQueuePage).toHaveBeenCalledWith(
      {
        schoolId: 'school-1',
        groupIds: ['group-1'],
        containerIds: ['course-1'],
        templateCodes: ['short_answer'],
      },
      { limit: 3, after: null },
    );

    expect(res.body.summary).toEqual({
      pending: 27,
      oldestSubmittedAt: '2026-08-10T08:00:00.000Z',
    });
    expect(res.body.groups.map((g: { key: string }) => g.key)).toEqual(['ex-2', 'ex-1']);
    expect(res.body.groups[0].items[0].attemptId).toBe('a1');
    expect(res.body.nextCursor).not.toBeNull();
  });

  it('resumes after the row a cursor names', async () => {
    const cursor = encodeReviewQueueCursor({
      submittedAt: new Date('2026-08-11T08:00:00Z'),
      id: 'a2',
    });

    await post('/internal/attempts/review/queue', {
      schoolId: 'school-1',
      containerIds: ['course-1'],
      cursor,
    }).expect(HttpStatus.CREATED);

    expect(mockRepo.findReviewQueuePage).toHaveBeenCalledWith(expect.anything(), {
      limit: 51,
      after: { submittedAt: new Date('2026-08-11T08:00:00Z'), id: 'a2' },
    });
  });

  it('counts a scope without reading a single submission', async () => {
    mockRepo.summariseReviewQueue.mockResolvedValue({
      pending: 27,
      oldestSubmittedAt: new Date('2026-08-10T08:00:00Z'),
    });

    const res = await post('/internal/attempts/review/queue/count', {
      schoolId: 'school-1',
      groupIds: ['group-1'],
    }).expect(HttpStatus.CREATED);

    expect(res.body).toEqual({ pending: 27, oldestSubmittedAt: '2026-08-10T08:00:00.000Z' });
    expect(mockRepo.findReviewQueuePage).not.toHaveBeenCalled();
  });

  it('422 — the count route holds the same scope rule', async () => {
    await post('/internal/attempts/review/queue/count', { schoolId: 'school-1' }).expect(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });
});
