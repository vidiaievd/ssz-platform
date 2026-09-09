import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { InternalReviewController } from '../../src/modules/attempts/presentation/controllers/internal-review.controller.js';
import { ClaimReviewHandler } from '../../src/modules/attempts/application/commands/claim-review/claim-review.handler.js';
import { ReleaseReviewHandler } from '../../src/modules/attempts/application/commands/release-review/release-review.handler.js';
import { ATTEMPT_REPOSITORY } from '../../src/modules/attempts/domain/repositories/attempt.repository.js';
import {
  Attempt,
  REVIEW_CLAIM_TTL_MS,
  type AttemptPersistenceProps,
} from '../../src/modules/attempts/domain/entities/attempt.entity.js';

const INTERNAL_TOKEN = 'internal-test-token';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const ATTEMPT_ID = 'b5b99bc6-bae7-4654-b64c-c2cdefa780e1';
const ME = 'teacher-1';
const COLLEAGUE = 'teacher-2';

function attempt(props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id: ATTEMPT_ID,
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
    submittedAnswer: { text: 'Jeg heter Anna.' },
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
    exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Leserinnlegg' },
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    ...props,
  });
}

describe('InternalReviewController — the "in hand" marker (integration)', () => {
  let app: INestApplication;

  const mockRepo = { findById: jest.fn(), save: jest.fn() };
  const path = `/internal/attempts/${ATTEMPT_ID}/review/lock`;

  const claim = (body: unknown) =>
    request(app.getHttpServer())
      .post(path)
      .set('x-internal-token', INTERNAL_TOKEN)
      .send(body as object);

  const release = (body: unknown) =>
    request(app.getHttpServer())
      .delete(path)
      .set('x-internal-token', INTERNAL_TOKEN)
      .send(body as object);

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findById.mockResolvedValue(null);
    mockRepo.save.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [InternalReviewController],
      providers: [
        ClaimReviewHandler,
        ReleaseReviewHandler,
        { provide: ATTEMPT_REPOSITORY, useValue: mockRepo },
        { provide: ConfigService, useValue: { get: () => INTERNAL_TOKEN } },
      ],
    }).compile();

    app = module.createNestApplication();
    // The global pipe exactly as main.ts configures it — the two 422s below are the
    // controller's own and have to survive it.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(() => app.close());

  it('401 — without the internal token', async () => {
    await request(app.getHttpServer())
      .post(path)
      .send({ schoolId: SCHOOL, teacherId: ME })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('422 — a claim without a school, and one without a reviewer', async () => {
    await claim({ teacherId: ME }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
    await claim({ schoolId: SCHOOL }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(mockRepo.findById).not.toHaveBeenCalled();
  });

  it('404 — a submission of another school', async () => {
    mockRepo.findById.mockResolvedValue(attempt({ schoolId: 'other-school' }));

    await claim({ schoolId: SCHOOL, teacherId: ME }).expect(HttpStatus.NOT_FOUND);
  });

  it('200 with the marker and the time it holds until', async () => {
    const row = attempt();
    mockRepo.findById.mockResolvedValue(row);

    const res = await claim({ schoolId: SCHOOL, teacherId: ME }).expect(HttpStatus.OK);

    expect(res.body.mine).toBe(true);
    expect(res.body.lock.teacherId).toBe(ME);
    expect(new Date(res.body.lock.expiresAt as string).getTime()).toBeGreaterThan(
      Date.now() + REVIEW_CLAIM_TTL_MS - 5_000,
    );
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it("200 with the colleague's marker rather than an error", async () => {
    mockRepo.findById.mockResolvedValue(
      attempt({ reviewClaimedBy: COLLEAGUE, reviewClaimedAt: new Date() }),
    );

    const res = await claim({ schoolId: SCHOOL, teacherId: ME }).expect(HttpStatus.OK);

    expect(res.body).toMatchObject({ mine: false, lock: { teacherId: COLLEAGUE } });
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('200 — a marker left to lapse is simply taken over', async () => {
    mockRepo.findById.mockResolvedValue(
      attempt({
        reviewClaimedBy: COLLEAGUE,
        reviewClaimedAt: new Date(Date.now() - REVIEW_CLAIM_TTL_MS - 1_000),
      }),
    );

    const res = await claim({ schoolId: SCHOOL, teacherId: ME }).expect(HttpStatus.OK);

    expect(res.body).toMatchObject({ mine: true, lock: { teacherId: ME } });
  });

  it('422 — claiming a submission a colleague has already decided', async () => {
    mockRepo.findById.mockResolvedValue(
      attempt({ status: 'SCORED', score: 90, reviewedByUserId: COLLEAGUE }),
    );

    await claim({ schoolId: SCHOOL, teacherId: ME }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('200 — releasing lifts the reviewer’s own marker', async () => {
    const row = attempt({ reviewClaimedBy: ME, reviewClaimedAt: new Date() });
    mockRepo.findById.mockResolvedValue(row);

    const res = await release({ schoolId: SCHOOL, teacherId: ME }).expect(HttpStatus.OK);

    expect(res.body).toEqual({ lock: null, mine: false });
    expect(row.reviewClaimedBy).toBeNull();
  });

  it("200 — releasing never lifts a colleague's", async () => {
    mockRepo.findById.mockResolvedValue(
      attempt({ reviewClaimedBy: COLLEAGUE, reviewClaimedAt: new Date() }),
    );

    const res = await release({ schoolId: SCHOOL, teacherId: ME }).expect(HttpStatus.OK);

    expect(res.body.lock.teacherId).toBe(COLLEAGUE);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('200 — releasing twice is not an error', async () => {
    mockRepo.findById.mockResolvedValue(attempt());

    await release({ schoolId: SCHOOL, teacherId: ME }).expect(HttpStatus.OK);
    await release({ schoolId: SCHOOL, teacherId: ME }).expect(HttpStatus.OK);
  });
});
