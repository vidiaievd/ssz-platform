import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpStatus, INestApplication, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { MySubmissionsController } from '../../src/modules/attempts/presentation/controllers/my-submissions.controller.js';
import { ListMySubmissionsHandler } from '../../src/modules/attempts/application/queries/list-my-submissions/list-my-submissions.handler.js';
import { ATTEMPT_REPOSITORY } from '../../src/modules/attempts/domain/repositories/attempt.repository.js';
import {
  Attempt,
  type AttemptPersistenceProps,
} from '../../src/modules/attempts/domain/entities/attempt.entity.js';

const LEARNER = '5d0f6c2e-8f43-4a5e-9d55-0b1c2d3e4f50';
const SOMEONE_ELSE = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

/** Stands in for the global JwtAuthGuard: a bearer token is the learner, none is a 401. */
const jwtGuard: CanActivate = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    if (!req.headers.authorization) throw new UnauthorizedException();
    req.user = { userId: LEARNER, roles: ['student'], isPlatformAdmin: false };
    return true;
  },
};

function attempt(props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id: 'att-1',
    userId: LEARNER,
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'writing_task',
    targetLanguage: 'no',
    difficultyLevel: 'A2',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'SCORED',
    score: 100,
    passed: true,
    timeSpentSeconds: 600,
    submittedAnswer: { text: 'the actual answer' },
    validationDetails: { reference: 'do not leak me' },
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-10-20T09:00:00Z'),
    submittedAt: new Date('2026-10-20T09:40:00Z'),
    scoredAt: new Date('2026-10-21T10:00:00Z'),
    reviewedByUserId: 'teacher-1',
    reviewedAt: new Date('2026-10-21T10:00:00Z'),
    reviewComment: 'Fint skrevet.',
    reviewDecisions: null,
    schoolId: 'school-1',
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 17', exercise: 'Skriv om deg selv' },
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    ...props,
  });
}

describe('MySubmissionsController (integration)', () => {
  let app: INestApplication;

  const mockRepo = {
    findMySubmissionsPage: jest.fn(),
    findLatestReturned: jest.fn(),
    findAiDraftedIds: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findMySubmissionsPage.mockImplementation(() => Promise.resolve([attempt()]));
    mockRepo.findLatestReturned.mockImplementation(() => Promise.resolve(null));
    mockRepo.findAiDraftedIds.mockImplementation(() => Promise.resolve(new Set(['att-1'])));

    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [MySubmissionsController],
      providers: [
        ListMySubmissionsHandler,
        { provide: ATTEMPT_REPOSITORY, useValue: mockRepo },
        { provide: APP_GUARD, useValue: jwtGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('200 — the token’s learner, with the draft flag on a teacher’s verdict', async () => {
    const res = await request(app.getHttpServer())
      .get('/attempts/mine')
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.OK);

    expect(mockRepo.findMySubmissionsPage).toHaveBeenCalledWith(LEARNER, 'all', {
      limit: 21,
      after: null,
    });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      attemptId: 'att-1',
      status: 'approved',
      exercisePath: { exercise: 'Skriv om deg selv' },
      decision: { verdict: 'approved', by: 'teacher', byUserId: 'teacher-1', aiDrafted: true },
    });
    expect(JSON.stringify(res.body)).not.toContain('the actual answer');
    expect(JSON.stringify(res.body)).not.toContain('do not leak me');
  });

  it('never reads a learner id off the request', async () => {
    await request(app.getHttpServer())
      .get(`/attempts/mine?userId=${SOMEONE_ELSE}`)
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.OK);

    expect(mockRepo.findMySubmissionsPage).toHaveBeenCalledWith(
      LEARNER,
      'all',
      expect.anything(),
    );
  });

  it('passes status and clamps limit', async () => {
    await request(app.getHttpServer())
      .get('/attempts/mine?status=pending&limit=500')
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.OK);

    expect(mockRepo.findMySubmissionsPage).toHaveBeenCalledWith(LEARNER, 'pending', {
      limit: 101,
      after: null,
    });
  });

  it('422 — an unknown status', async () => {
    await request(app.getHttpServer())
      .get('/attempts/mine?status=failed')
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('422 — a cursor this service did not issue', async () => {
    await request(app.getHttpServer())
      .get('/attempts/mine?cursor=not-a-cursor')
      .set('Authorization', 'Bearer token')
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('401 — no token', async () => {
    await request(app.getHttpServer()).get('/attempts/mine').expect(HttpStatus.UNAUTHORIZED);
    expect(mockRepo.findMySubmissionsPage).not.toHaveBeenCalled();
  });
});
