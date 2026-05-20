/**
 * Scenario 2 — Free-form submission cycle
 *
 *   student submits free-form exercise (Learning Service HTTP)
 *   → Submission created with PENDING_REVIEW
 *   → tutor approves (PATCH /review/submissions/:id/review)
 *   → learning.submission.reviewed published with decision APPROVED
 *   → UserProgress transitions to COMPLETED
 */

import { randomUUID } from 'node:crypto';
import { LEARNING_EVENT_TYPES } from '@ssz/contracts/events';
import { InfraContainers } from '../helpers/infra.js';
import { ServiceProcess } from '../helpers/services.js';
import { AmqpEventCapture } from '../helpers/amqp.js';
import { DatabaseClient, createDatabase } from '../helpers/db.js';
import { StubServer } from '../helpers/stub-server.js';
import { createJwtHelper } from '../helpers/jwt.js';
import { createClient } from '../helpers/http.js';

const LEARNING_PORT = 3102;

describe('Scenario 2 — Free-form submission cycle', () => {
  const infra = new InfraContainers();
  const learning = new ServiceProcess();
  const events = new AmqpEventCapture();
  const db = new DatabaseClient();
  const contentStub = new StubServer();
  const orgStub = new StubServer();

  const EXERCISE_ID = randomUUID();
  const SCHOOL_ID = randomUUID();
  const STUDENT_ID = randomUUID();
  const TUTOR_ID = randomUUID();

  let learningUrl: string;
  let jwtHelper: ReturnType<typeof createJwtHelper>;

  beforeAll(async () => {
    const ports = await infra.start();
    await createDatabase(ports.postgresUrl, 'learning_s2');

    jwtHelper = createJwtHelper();

    // Org Service stub: tutor is a TEACHER, student is a STUDENT in the school
    orgStub.register('GET', /\/schools\/.*\/members\/.*\/role/, (url) => {
      const userId = url.pathname.split('/').pop()!;
      const role = userId === TUTOR_ID ? 'TEACHER' : 'STUDENT';
      return { status: 200, body: { role } };
    });
    // Content Service stub (not called in this scenario but URL must resolve)
    contentStub.register('GET', '/', () => ({ status: 200, body: {} }));
    await Promise.all([orgStub.start(), contentStub.start()]);

    learningUrl = await learning.start('learning-service', LEARNING_PORT, {
      databaseUrl: ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s2'),
      rabbitmqUrl: ports.rabbitmqUrl,
      redisHost: ports.redisHost,
      redisPort: ports.redisPort,
      redisPassword: ports.redisPassword,
      redisDb: 4,
      jwtPublicKey: jwtHelper.publicKey,
      contentServiceUrl: contentStub.url,
      orgServiceUrl: orgStub.url,
    });

    await events.connect(ports.rabbitmqUrl, [
      LEARNING_EVENT_TYPES.SUBMISSION_REVIEWED,
      LEARNING_EVENT_TYPES.PROGRESS_COMPLETED,
    ]);

    db.connect(ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s2'));
  }, 120_000);

  afterAll(async () => {
    await events.disconnect();
    await db.close();
    learning.stop();
    await Promise.all([orgStub.stop(), contentStub.stop()]);
    await infra.stop();
  });

  it('creates submission, tutor approves, reviewed event published, progress COMPLETED', async () => {
    const studentClient = createClient(learningUrl, jwtHelper.makeToken(STUDENT_ID, ['student']));
    const tutorClient = createClient(learningUrl, jwtHelper.makeToken(TUTOR_ID, ['tutor']));

    // 1. Student submits free-form exercise
    const submitRes = await studentClient.post('/review/submissions', {
      exerciseId: EXERCISE_ID,
      schoolId: SCHOOL_ID,
      text: 'My answer to the free-form exercise.',
    });
    expect(submitRes.status).toBe(201);
    const submissionId: string = submitRes.data.id;
    expect(submitRes.data.status).toBe('PENDING_REVIEW');

    // 2. Submission persisted in DB as PENDING_REVIEW
    const dbRow = await db.queryOne(
      `SELECT status FROM submissions WHERE id = $1`,
      [submissionId],
    );
    expect(dbRow!['status']).toBe('pending_review');

    // 3. Tutor approves
    const reviewRes = await tutorClient.patch(`/review/submissions/${submissionId}/review`, {
      decision: 'APPROVED',
      feedback: 'Well done.',
      score: 90,
    });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.data.status).toBe('APPROVED');

    // 4. learning.submission.reviewed published
    const reviewedEvent = await events.waitFor(
      (e) => e.eventType === LEARNING_EVENT_TYPES.SUBMISSION_REVIEWED,
    );
    expect(reviewedEvent.payload).toMatchObject({
      submissionId,
      userId: STUDENT_ID,
      reviewerId: TUTOR_ID,
      decision: 'APPROVED',
    });

    // 5. Progress transitions to COMPLETED (via ResolveReviewCommand)
    const progressEvent = await events.waitFor(
      (e) => e.eventType === LEARNING_EVENT_TYPES.PROGRESS_COMPLETED,
      20_000,
    );
    expect(progressEvent.payload).toMatchObject({
      userId: STUDENT_ID,
      contentType: 'EXERCISE',
      contentId: EXERCISE_ID,
    });
  });
});
