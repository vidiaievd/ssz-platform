/**
 * Scenario 1 — Closed-form attempt loop
 *
 * Covers the full cross-service path:
 *   student starts attempt (Exercise Engine)
 *   → submits correct answer
 *   → Exercise Engine scores & publishes exercise.attempt.completed
 *   → Learning Service consumes event, upserts progress, introduces SRS card
 *   → learning.progress.completed is published
 *   → progress row in DB has status = COMPLETED
 */

import { randomUUID } from 'node:crypto';
import { EXERCISE_ENGINE_EVENT_TYPES } from '@ssz/contracts/events';
import { LEARNING_EVENT_TYPES } from '@ssz/contracts/events';
import { InfraContainers } from '../helpers/infra.js';
import { ServiceProcess } from '../helpers/services.js';
import { AmqpEventCapture } from '../helpers/amqp.js';
import { DatabaseClient, createDatabase } from '../helpers/db.js';
import { StubServer } from '../helpers/stub-server.js';
import { createJwtHelper } from '../helpers/jwt.js';
import { createClient } from '../helpers/http.js';

const LEARNING_PORT = 3100;
const ENGINE_PORT = 3101;

describe('Scenario 1 — Closed-form attempt loop', () => {
  const infra = new InfraContainers();
  const learning = new ServiceProcess();
  const engine = new ServiceProcess();
  const events = new AmqpEventCapture();
  const db = new DatabaseClient();
  const contentStub = new StubServer();
  const orgStub = new StubServer();

  const EXERCISE_ID = randomUUID();
  const STUDENT_ID = randomUUID();

  let learningUrl: string;
  let engineUrl: string;
  let jwtHelper: ReturnType<typeof createJwtHelper>;

  beforeAll(async () => {
    const ports = await infra.start();

    // Create per-scenario databases
    const adminUrl = ports.postgresUrl;
    await createDatabase(adminUrl, 'learning_s1');
    await createDatabase(adminUrl, 'engine_s1');

    jwtHelper = createJwtHelper();

    // Content Service stub — Exercise Engine calls GET /api/v1/internal/exercises/:id
    const exerciseDef = {
      exercise: {
        id: EXERCISE_ID,
        templateCode: 'fill_in_blank',
        targetLanguage: 'en',
        difficultyLevel: 'A1',
        content: { blanks: [{ blank_id: 1, sentence: 'The cat ___ on the mat.' }] },
        expectedAnswers: { blanks: [{ blank_id: 1, accepted_answers: ['sat'] }] },
        answerCheckSettings: { case_sensitive: false, trim_whitespace: true },
      },
      template: {
        code: 'fill_in_blank',
        contentSchema: {},
        answerSchema: { type: 'object' },
        defaultCheckSettings: { passingThreshold: 70, allow_partial_credit: false },
        supportedLanguages: ['en'],
      },
      instruction: { language: 'en', text: 'Fill in the blank', hint: null, overrides: null },
    };
    contentStub.register('GET', /\/api\/v1\/internal\/exercises\//, () => ({
      status: 200,
      body: exerciseDef,
    }));
    // Learning Service stub — checkVisibilityForUser (not called in this scenario but URL must be reachable)
    contentStub.register('GET', '/api/internal', () => ({ status: 200, body: { isVisible: true } }));
    orgStub.register('GET', '/schools', () => ({ status: 200, body: { role: 'TEACHER' } }));
    await Promise.all([contentStub.start(), orgStub.start()]);

    const baseEnv = {
      rabbitmqUrl: ports.rabbitmqUrl,
      redisHost: ports.redisHost,
      redisPort: ports.redisPort,
      redisPassword: ports.redisPassword,
      jwtPublicKey: jwtHelper.publicKey,
      contentServiceUrl: contentStub.url,
      orgServiceUrl: orgStub.url,
    };

    learningUrl = await learning.start('learning-service', LEARNING_PORT, {
      ...baseEnv,
      databaseUrl: ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s1'),
      redisDb: 4,
    });

    engineUrl = await engine.start('exercise-engine-service', ENGINE_PORT, {
      ...baseEnv,
      databaseUrl: ports.postgresUrl.replace(/\/[^/]+$/, '/engine_s1'),
      redisDb: 5,
      extra: {
        CONTENT_SERVICE_BASE_URL: contentStub.url,
        ORGANIZATION_SERVICE_BASE_URL: orgStub.url,
        LEARNING_SERVICE_BASE_URL: learningUrl,
        EXERCISE_DEFINITION_CACHE_TTL_SECONDS: '1',
      },
    });

    // Capture events published to both routing keys
    await events.connect(ports.rabbitmqUrl, [
      EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_COMPLETED,
      LEARNING_EVENT_TYPES.PROGRESS_COMPLETED,
    ]);

    db.connect(ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s1'));
  }, 180_000);

  afterAll(async () => {
    await events.disconnect();
    await db.close();
    learning.stop();
    engine.stop();
    await Promise.all([contentStub.stop(), orgStub.stop()]);
    await infra.stop();
  });

  it('scores attempt, publishes exercise.attempt.completed, progress transitions to COMPLETED', async () => {
    const studentToken = jwtHelper.makeToken(STUDENT_ID, ['student']);
    const engineClient = createClient(engineUrl, studentToken);

    // 1. Start attempt
    const startRes = await engineClient.post(`/api/v1/exercises/${EXERCISE_ID}/attempts`, {
      language: 'en',
    });
    expect(startRes.status).toBe(201);
    const { attemptId } = startRes.data;

    // 2. Submit correct answer (FIB: blank_id=1 → "sat")
    const submitRes = await engineClient.post(
      `/api/v1/exercises/${EXERCISE_ID}/attempts/${attemptId}/submit`,
      {
        submittedAnswer: { blanks: [{ blank_id: 1, accepted_answers: ['sat'] }] },
        timeSpentSeconds: 10,
      },
    );
    expect(submitRes.status).toBe(200);
    expect(submitRes.data.correct).toBe(true);
    expect(submitRes.data.requiresReview).toBe(false);

    // 3. exercise.attempt.completed published by Exercise Engine
    const attemptEvent = await events.waitFor(
      (e) => e.eventType === EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_COMPLETED,
    );
    expect(attemptEvent.payload).toMatchObject({
      userId: STUDENT_ID,
      exerciseId: EXERCISE_ID,
      completed: true,
    });
    expect((attemptEvent.payload as { score: number }).score).toBeGreaterThanOrEqual(70);

    // 4. Learning Service consumes event → publishes learning.progress.completed
    const progressEvent = await events.waitFor(
      (e) => e.eventType === LEARNING_EVENT_TYPES.PROGRESS_COMPLETED,
      30_000,
    );
    expect(progressEvent.payload).toMatchObject({
      userId: STUDENT_ID,
      contentType: 'EXERCISE',
      contentId: EXERCISE_ID,
    });

    // 5. Progress row persisted in learning DB
    const row = await db.queryOne(
      `SELECT status, score FROM user_progress WHERE user_id = $1 AND content_id = $2`,
      [STUDENT_ID, EXERCISE_ID],
    );
    expect(row).not.toBeNull();
    expect(row!['status']).toBe('completed');
    expect(Number(row!['score'])).toBeGreaterThanOrEqual(70);
  });
});
