import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { InternalReviewController } from '../../src/modules/attempts/presentation/controllers/internal-review.controller.js';
import { AggregateReviewLoadHandler } from '../../src/modules/attempts/application/queries/aggregate-review-load/aggregate-review-load.handler.js';
import { ListReviewDecisionsHandler } from '../../src/modules/attempts/application/queries/list-review-decisions/list-review-decisions.handler.js';
import { encodeReviewDecisionsCursor } from '../../src/modules/attempts/application/queries/list-review-decisions/review-decisions-cursor.js';
import { ATTEMPT_REPOSITORY } from '../../src/modules/attempts/domain/repositories/attempt.repository.js';
import {
  Attempt,
  type AttemptPersistenceProps,
} from '../../src/modules/attempts/domain/entities/attempt.entity.js';

const INTERNAL_TOKEN = 'internal-test-token';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';

function decided(props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id: 'att-1',
    userId: 'student-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'A2',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'SCORED',
    score: 100,
    passed: true,
    timeSpentSeconds: 300,
    submittedAnswer: {},
    validationDetails: null,
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-08-17T08:00:00Z'),
    submittedAt: new Date('2026-08-17T09:00:00Z'),
    scoredAt: new Date('2026-08-17T13:00:00Z'),
    reviewedByUserId: 'teacher-1',
    reviewedAt: new Date('2026-08-17T13:00:00Z'),
    reviewComment: null,
    reviewDecisions: null,
    schoolId: SCHOOL,
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: null,
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    ...props,
  });
}

describe('InternalReviewController — oversight (integration)', () => {
  let app: INestApplication;

  const mockRepo = {
    findPendingLoad: jest.fn(),
    findReviewedLoad: jest.fn(),
    earliestSubmissionAt: jest.fn(),
    findReviewDecisionsPage: jest.fn(),
  };

  const aggregate = (body: unknown) =>
    request(app.getHttpServer())
      .post('/internal/attempts/review/aggregate')
      .set('x-internal-token', INTERNAL_TOKEN)
      .send(body as object);

  const decisions = (queryString: string) =>
    request(app.getHttpServer())
      .get(`/internal/attempts/review/decisions${queryString}`)
      .set('x-internal-token', INTERNAL_TOKEN);

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findPendingLoad.mockResolvedValue([]);
    mockRepo.findReviewedLoad.mockResolvedValue([]);
    mockRepo.earliestSubmissionAt.mockResolvedValue(new Date('2026-06-01T08:00:00Z'));
    mockRepo.findReviewDecisionsPage.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [InternalReviewController],
      providers: [
        AggregateReviewLoadHandler,
        ListReviewDecisionsHandler,
        { provide: ATTEMPT_REPOSITORY, useValue: mockRepo },
        { provide: ConfigService, useValue: { get: () => INTERNAL_TOKEN } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(() => app.close());

  it('401 — either route without the internal token', async () => {
    await request(app.getHttpServer())
      .post('/internal/attempts/review/aggregate')
      .send({ schoolId: SCHOOL })
      .expect(HttpStatus.UNAUTHORIZED);
    await request(app.getHttpServer())
      .get(`/internal/attempts/review/decisions?schoolId=${SCHOOL}`)
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('422 — either route without a school', async () => {
    await aggregate({ periodDays: 7 }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
    await decisions('').expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(mockRepo.findPendingLoad).not.toHaveBeenCalled();
  });

  it('400 — a period that is not a number of days', async () => {
    await aggregate({ schoolId: SCHOOL, periodDays: 0 }).expect(HttpStatus.BAD_REQUEST);
    await aggregate({ schoolId: SCHOOL, periodDays: 900 }).expect(HttpStatus.BAD_REQUEST);
  });

  it('200 with the load, and thirty days when no period was named', async () => {
    const res = await aggregate({ schoolId: SCHOOL }).expect(HttpStatus.OK);

    expect(res.body).toMatchObject({
      since: '2026-06-01T08:00:00.000Z',
      pending: [],
      reviewed: [],
      unassigned: [],
      truncated: false,
    });

    const [, since] = mockRepo.findReviewedLoad.mock.calls[0]!;
    expect((Date.now() - (since as Date).getTime()) / 86_400_000).toBeCloseTo(30, 1);
  });

  /** The literal segment has to keep winning over `:attemptId/review`. */
  it('200 on the journal rather than reading an attempt called "review"', async () => {
    mockRepo.findReviewDecisionsPage.mockResolvedValue([decided()]);

    const res = await decisions(`?schoolId=${SCHOOL}&periodDays=7&limit=10`).expect(
      HttpStatus.OK,
    );

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      attemptId: 'att-1',
      reviewerId: 'teacher-1',
      verdict: 'approved',
    });
    expect(res.body.nextCursor).toBeNull();
  });

  it('422 — a cursor this service did not issue', async () => {
    await decisions(`?schoolId=${SCHOOL}&cursor=not-a-cursor`).expect(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('reads on from a cursor it did issue', async () => {
    const cursor = encodeReviewDecisionsCursor({
      reviewedAt: new Date('2026-08-17T13:00:00Z'),
      id: 'att-1',
    });

    await decisions(`?schoolId=${SCHOOL}&cursor=${cursor}`).expect(HttpStatus.OK);

    expect(mockRepo.findReviewDecisionsPage.mock.calls[0]![2]).toMatchObject({
      after: { reviewedAt: new Date('2026-08-17T13:00:00Z'), id: 'att-1' },
    });
  });
});
