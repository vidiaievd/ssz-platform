import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { InternalReviewController } from '../../src/modules/attempts/presentation/controllers/internal-review.controller.js';
import { GetSubmissionForReviewHandler } from '../../src/modules/attempts/application/queries/get-submission-for-review/get-submission-for-review.handler.js';
import { ATTEMPT_REPOSITORY } from '../../src/modules/attempts/domain/repositories/attempt.repository.js';
import { ANSWER_VALIDATOR } from '../../src/shared/application/ports/answer-validator.port.js';
import {
  CONTENT_CLIENT,
  ContentClientError,
} from '../../src/shared/application/ports/content-client.port.js';
import {
  Attempt,
  type AttemptPersistenceProps,
} from '../../src/modules/attempts/domain/entities/attempt.entity.js';
import { Result } from '../../src/shared/kernel/result.js';

const INTERNAL_TOKEN = 'internal-test-token';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const ATTEMPT_ID = 'b5b99bc6-bae7-4654-b64c-c2cdefa780e1';
const PREVIOUS_ID = 'a4a1f0c2-2a3d-4a2c-9b7e-2f9c1d3e4b55';

function attempt(props: Partial<AttemptPersistenceProps> & { id: string }): Attempt {
  return Attempt.reconstitute({
    userId: 'student-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'writing_task',
    targetLanguage: 'no',
    difficultyLevel: 'A2',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'ROUTED_FOR_REVIEW',
    score: null,
    passed: null,
    timeSpentSeconds: 600,
    submittedAnswer: { text: 'Jeg heter Anna og jeg bor i Oslo.', topicId: 't1' },
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
    exercisePath: {
      course: 'Ny i Norge — A2',
      module: 'Leksjon 17',
      exercise: 'Skriv om deg selv',
    },
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    ...props,
  });
}

describe('InternalReviewController — one submission (integration)', () => {
  let app: INestApplication;

  const mockRepo = { findById: jest.fn() };
  const mockContent = { getExerciseForAttempt: jest.fn() };
  const mockValidator = { validate: jest.fn() };

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('x-internal-token', INTERNAL_TOKEN);

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findById.mockResolvedValue(null);
    mockContent.getExerciseForAttempt.mockResolvedValue(
      Result.ok({
        exercise: {
          id: 'ex-1',
          templateCode: 'writing_task',
          targetLanguage: 'no',
          difficultyLevel: 'A2',
          content: {},
          expectedAnswers: null,
          answerCheckSettings: null,
        },
        template: {
          code: 'writing_task',
          contentSchema: {},
          answerSchema: {},
          defaultCheckSettings: {},
          supportedLanguages: null,
        },
        instruction: null,
      }),
    );
    mockValidator.validate.mockResolvedValue(Result.ok({ details: { items: [] } }));

    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [InternalReviewController],
      providers: [
        GetSubmissionForReviewHandler,
        { provide: ATTEMPT_REPOSITORY, useValue: mockRepo },
        { provide: ANSWER_VALIDATOR, useValue: mockValidator },
        { provide: CONTENT_CLIENT, useValue: mockContent },
        { provide: ConfigService, useValue: { get: () => INTERNAL_TOKEN } },
      ],
    }).compile();

    app = module.createNestApplication();
    // The global pipe exactly as main.ts configures it — the schoolId rule below is the
    // controller's own, and it has to hold with this pipe in front of it.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(() => app.close());

  it('401 — without the internal token', async () => {
    await request(app.getHttpServer())
      .get(`/internal/attempts/${ATTEMPT_ID}/review?schoolId=${SCHOOL}`)
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('422 — a submission asked for without a school', async () => {
    await get(`/internal/attempts/${ATTEMPT_ID}/review`).expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(mockRepo.findById).not.toHaveBeenCalled();
  });

  it('404 — a submission of another school', async () => {
    mockRepo.findById.mockResolvedValue(attempt({ id: ATTEMPT_ID, schoolId: 'other-school' }));

    await get(`/internal/attempts/${ATTEMPT_ID}/review?schoolId=${SCHOOL}`).expect(
      HttpStatus.NOT_FOUND,
    );
  });

  it('404 — no such submission', async () => {
    await get(`/internal/attempts/${ATTEMPT_ID}/review?schoolId=${SCHOOL}`).expect(
      HttpStatus.NOT_FOUND,
    );
  });

  it('returns the path, the essay and the recomputed parse', async () => {
    mockRepo.findById.mockResolvedValue(attempt({ id: ATTEMPT_ID }));

    const res = await get(`/internal/attempts/${ATTEMPT_ID}/review?schoolId=${SCHOOL}`).expect(
      HttpStatus.OK,
    );

    expect(res.body).toMatchObject({
      attemptId: ATTEMPT_ID,
      status: 'ROUTED_FOR_REVIEW',
      templateCode: 'writing_task',
      targetLanguage: 'no',
      exerciseAvailable: true,
      attemptNo: 1,
      previous: null,
      decision: null,
      lock: null,
      text: 'Jeg heter Anna og jeg bor i Oslo.',
      details: { items: [] },
    });
    expect(res.body.path).toEqual({
      course: 'Ny i Norge — A2',
      module: 'Leksjon 17',
      exercise: 'Skriv om deg selv',
    });
    expect(res.body.submittedAt).toBe('2026-08-17T09:40:00.000Z');
  });

  it('200 with details: null when the parse cannot be built', async () => {
    mockRepo.findById.mockResolvedValue(attempt({ id: ATTEMPT_ID }));
    mockValidator.validate.mockResolvedValue(Result.fail(new Error('unreadable')));

    const res = await get(`/internal/attempts/${ATTEMPT_ID}/review?schoolId=${SCHOOL}`).expect(
      HttpStatus.OK,
    );

    expect(res.body.details).toBeNull();
    expect(res.body.text).toBe('Jeg heter Anna og jeg bor i Oslo.');
  });

  it('200 for a submission whose exercise the author deleted', async () => {
    mockRepo.findById.mockResolvedValue(attempt({ id: ATTEMPT_ID }));
    mockContent.getExerciseForAttempt.mockResolvedValue(
      Result.fail(new ContentClientError(404, 'gone')),
    );

    const res = await get(`/internal/attempts/${ATTEMPT_ID}/review?schoolId=${SCHOOL}`).expect(
      HttpStatus.OK,
    );

    expect(res.body.exerciseAvailable).toBe(false);
    expect(res.body.details).toBeNull();
    expect(res.body.path.exercise).toBe('Skriv om deg selv');
  });

  it('brings the previous comment along on a resubmission', async () => {
    mockRepo.findById.mockImplementation((id: string) =>
      Promise.resolve(
        id === ATTEMPT_ID
          ? attempt({ id: ATTEMPT_ID, previousAttemptId: PREVIOUS_ID, revisionCount: 1 })
          : attempt({
              id: PREVIOUS_ID,
              status: 'RETURNED',
              reviewedByUserId: 'teacher-9',
              reviewedAt: new Date('2026-08-16T12:00:00Z'),
              reviewComment: 'Skriv litt mer om familien din.',
            }),
      ),
    );

    const res = await get(`/internal/attempts/${ATTEMPT_ID}/review?schoolId=${SCHOOL}`).expect(
      HttpStatus.OK,
    );

    expect(res.body.attemptNo).toBe(2);
    expect(res.body.previous).toEqual({
      attemptId: PREVIOUS_ID,
      outcome: 'returned',
      at: '2026-08-16T12:00:00.000Z',
      reviewerId: 'teacher-9',
      comment: 'Skriv litt mer om familien din.',
    });
  });
});
