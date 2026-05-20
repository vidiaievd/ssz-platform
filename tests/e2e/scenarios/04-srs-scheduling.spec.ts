/**
 * Scenario 4 — SRS scheduling after attempt
 *
 *   Publish exercise.attempt.completed (score=95, completed=true) directly to RabbitMQ
 *   → ExerciseAttemptedConsumer introduces SRS card + reviews it as EASY
 *   → card created in DB with state LEARNING/REVIEW and dueAt ≤ now + SRS_MAX_INTERVAL_DAYS
 *   → call POST /srs/cards/:id/review with rating=GOOD
 *   → card rescheduled: dueAt advanced, reps incremented
 */

import { randomUUID } from 'node:crypto';
import { EXERCISE_ENGINE_EVENT_TYPES } from '@ssz/contracts/events';
import { InfraContainers } from '../helpers/infra.js';
import { ServiceProcess } from '../helpers/services.js';
import { AmqpEventCapture } from '../helpers/amqp.js';
import { DatabaseClient, createDatabase } from '../helpers/db.js';
import { StubServer } from '../helpers/stub-server.js';
import { createJwtHelper } from '../helpers/jwt.js';
import { createClient } from '../helpers/http.js';

const LEARNING_PORT = 3104;
const SRS_MAX_INTERVAL_DAYS = 365;

describe('Scenario 4 — SRS scheduling after attempt', () => {
  const infra = new InfraContainers();
  const learning = new ServiceProcess();
  const events = new AmqpEventCapture();
  const db = new DatabaseClient();
  const contentStub = new StubServer();
  const orgStub = new StubServer();

  const EXERCISE_ID = randomUUID();
  const STUDENT_ID = randomUUID();

  let learningUrl: string;
  let jwtHelper: ReturnType<typeof createJwtHelper>;

  beforeAll(async () => {
    const ports = await infra.start();
    await createDatabase(ports.postgresUrl, 'learning_s4');

    jwtHelper = createJwtHelper();

    contentStub.register('GET', '/', () => ({ status: 200, body: {} }));
    orgStub.register('GET', '/', () => ({ status: 200, body: {} }));
    await Promise.all([contentStub.start(), orgStub.start()]);

    learningUrl = await learning.start('learning-service', LEARNING_PORT, {
      databaseUrl: ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s4'),
      rabbitmqUrl: ports.rabbitmqUrl,
      redisHost: ports.redisHost,
      redisPort: ports.redisPort,
      redisPassword: ports.redisPassword,
      redisDb: 4,
      jwtPublicKey: jwtHelper.publicKey,
      contentServiceUrl: contentStub.url,
      orgServiceUrl: orgStub.url,
      extra: { SRS_MAX_INTERVAL_DAYS: String(SRS_MAX_INTERVAL_DAYS) },
    });

    // Connect to RabbitMQ for publishing (no routing keys to capture in this scenario)
    await events.connect(ports.rabbitmqUrl, []);
    db.connect(ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s4'));
  }, 120_000);

  afterAll(async () => {
    await events.disconnect();
    await db.close();
    learning.stop();
    await Promise.all([contentStub.stop(), orgStub.stop()]);
    await infra.stop();
  });

  it('introduces SRS card on high-score attempt, advances schedule on manual GOOD review', async () => {
    const studentClient = createClient(learningUrl, jwtHelper.makeToken(STUDENT_ID, ['student']));

    // 1. Publish exercise.attempt.completed (score=95 → EASY rating)
    await events.publish(EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_COMPLETED, {
      userId: STUDENT_ID,
      exerciseId: EXERCISE_ID,
      score: 95,
      timeSpentSeconds: 30,
      completed: true,
    });

    // 2. Poll until SRS card appears in DB (consumer processes asynchronously)
    let card: Record<string, unknown> | null = null;
    const deadline = Date.now() + 20_000;
    while (!card && Date.now() < deadline) {
      card = await db.queryOne(
        `SELECT id, state, due_at, reps, stability
         FROM srs_review_cards
         WHERE user_id = $1 AND content_type = 'exercise' AND content_id = $2`,
        [STUDENT_ID, EXERCISE_ID],
      );
      if (!card) await new Promise((r) => setTimeout(r, 500));
    }
    expect(card).not.toBeNull();

    // Card was introduced then immediately reviewed (EASY from score=95), so state should
    // be REVIEW or LEARNING (FSRS moves NEW → LEARNING/REVIEW after first review).
    expect(['learning', 'review']).toContain(card!['state']);

    const dueAt = new Date(card!['due_at'] as string);
    const maxDueAt = new Date(Date.now() + SRS_MAX_INTERVAL_DAYS * 86_400_000);
    expect(dueAt.getTime()).toBeLessThanOrEqual(maxDueAt.getTime());

    const cardId = card!['id'] as string;
    const repsAfterFirst = Number(card!['reps']);

    // 3. Second review: GOOD rating via HTTP
    const reviewRes = await studentClient.post(`/api/v1/srs/cards/${cardId}/review`, {
      rating: 'GOOD',
    });
    expect(reviewRes.status).toBe(200);

    const updatedDueAt = new Date(reviewRes.data.dueAt);
    const updatedReps = reviewRes.data.reps;

    // dueAt must have advanced (be after the original)
    expect(updatedDueAt.getTime()).toBeGreaterThan(dueAt.getTime());
    // reps must have incremented
    expect(updatedReps).toBeGreaterThan(repsAfterFirst);
    // still within max interval
    expect(updatedDueAt.getTime()).toBeLessThanOrEqual(maxDueAt.getTime());
  });
});
