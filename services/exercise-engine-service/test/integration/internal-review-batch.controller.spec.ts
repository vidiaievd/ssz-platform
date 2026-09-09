import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { InternalReviewController } from '../../src/modules/attempts/presentation/controllers/internal-review.controller.js';
import { BatchApproveHandler } from '../../src/modules/attempts/application/commands/batch-approve/batch-approve.handler.js';
import { ReviewScoring } from '../../src/modules/attempts/application/services/review-scoring.js';
import { ATTEMPT_REPOSITORY } from '../../src/modules/attempts/domain/repositories/attempt.repository.js';
import { ANSWER_VALIDATOR } from '../../src/shared/application/ports/answer-validator.port.js';
import { CONTENT_CLIENT } from '../../src/shared/application/ports/content-client.port.js';
import { EVENT_PUBLISHER } from '../../src/shared/application/ports/event-publisher.port.js';
import { Result } from '../../src/shared/kernel/result.js';
import {
  Attempt,
  type AttemptPersistenceProps,
} from '../../src/modules/attempts/domain/entities/attempt.entity.js';

const INTERNAL_TOKEN = 'internal-test-token';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const ME = 'teacher-1';
const PATH = '/internal/attempts/review/batch-approve';

/** Two sentences, both closed by the machine — the shape a batch is for. */
const CLEAN = {
  totalItems: 2,
  items: [
    { itemId: 'i1', routing: 'pass', verdict: 'exact' },
    { itemId: 'i2', routing: 'pass', verdict: 'exact' },
  ],
};

function attempt(id: string, props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id,
    userId: 'student-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'A2',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'ROUTED_FOR_REVIEW',
    score: null,
    passed: null,
    timeSpentSeconds: 600,
    submittedAnswer: { items: [{ itemId: 'i1', text: 'Jeg heter Anna.' }] },
    validationDetails: null,
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-08-17T09:00:00Z'),
    submittedAt: new Date('2026-08-17T09:40:00Z'),
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    reviewDecisions: null,
    schoolId: SCHOOL,
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: null,
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: 2,
    totalItems: 2,
    ...props,
  });
}

describe('InternalReviewController — batch approval (integration)', () => {
  let app: INestApplication;

  const mockRepo = { findById: jest.fn(), save: jest.fn() };
  const mockValidator = { validate: jest.fn() };
  const mockContent = { getExerciseForAttempt: jest.fn() };
  const mockPublisher = { publish: jest.fn() };

  const post = (body: unknown) =>
    request(app.getHttpServer())
      .post(PATH)
      .set('x-internal-token', INTERNAL_TOKEN)
      .send(body as object);

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findById.mockResolvedValue(null);
    mockRepo.save.mockResolvedValue(undefined);
    mockPublisher.publish.mockResolvedValue(undefined);
    mockValidator.validate.mockResolvedValue(
      Result.ok({ correct: true, score: 100, details: CLEAN, requiresReview: false }),
    );
    mockContent.getExerciseForAttempt.mockResolvedValue(
      Result.ok({
        exercise: { content: {}, expectedAnswers: {}, answerCheckSettings: null },
        template: { answerSchema: {}, defaultCheckSettings: {} },
      }),
    );

    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [InternalReviewController],
      providers: [
        BatchApproveHandler,
        ReviewScoring,
        { provide: ATTEMPT_REPOSITORY, useValue: mockRepo },
        { provide: ANSWER_VALIDATOR, useValue: mockValidator },
        { provide: CONTENT_CLIENT, useValue: mockContent },
        { provide: EVENT_PUBLISHER, useValue: mockPublisher },
        { provide: ConfigService, useValue: { get: () => INTERNAL_TOKEN } },
      ],
    }).compile();

    app = module.createNestApplication();
    // The global pipe exactly as main.ts configures it — the 422s below are the
    // controller's own and have to survive it.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(() => app.close());

  it('401 — without the internal token', async () => {
    await request(app.getHttpServer())
      .post(PATH)
      .send({ schoolId: SCHOOL, reviewerId: ME, attemptIds: ['a'] })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('422 — without a school, and without a reviewer', async () => {
    await post({ reviewerId: ME, attemptIds: ['a'] }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
    await post({ schoolId: SCHOOL, attemptIds: ['a'] }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(mockRepo.findById).not.toHaveBeenCalled();
  });

  /** The list is the whole point: an empty one is a body that says nothing. */
  it('400 — with no submissions named at all', async () => {
    await post({ schoolId: SCHOOL, reviewerId: ME, attemptIds: [] }).expect(
      HttpStatus.BAD_REQUEST,
    );
  });

  it('422 — beyond a hundred at a time', async () => {
    const attemptIds = Array.from({ length: 101 }, (_, i) => `att-${i}`);

    await post({ schoolId: SCHOOL, reviewerId: ME, attemptIds }).expect(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    expect(mockRepo.findById).not.toHaveBeenCalled();
  });

  it('200 with the count and the names it left alone', async () => {
    const rows: Record<string, Attempt | null> = {
      a: attempt('a'),
      b: attempt('b', { status: 'SCORED', score: 100, reviewedByUserId: 'teacher-2', reviewedAt: new Date() }),
      c: null,
    };
    mockRepo.findById.mockImplementation((id: unknown) => Promise.resolve(rows[String(id)] ?? null));

    const res = await post({ schoolId: SCHOOL, reviewerId: ME, attemptIds: ['a', 'b', 'c'] }).expect(
      HttpStatus.OK,
    );

    expect(res.body).toEqual({
      approved: 1,
      skipped: [
        { id: 'b', reason: 'already_reviewed' },
        { id: 'c', reason: 'not_found' },
      ],
    });
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  /** The same submission named twice is one submission, not two verdicts. */
  it('acts on a repeated identifier once', async () => {
    mockRepo.findById.mockResolvedValue(attempt('a'));

    const res = await post({ schoolId: SCHOOL, reviewerId: ME, attemptIds: ['a', 'a'] }).expect(
      HttpStatus.OK,
    );

    expect(res.body.approved).toBe(1);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });
});
