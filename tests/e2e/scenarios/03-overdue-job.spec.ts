/**
 * Scenario 3 — Overdue assignment job
 *
 *   create assignment with dueAt in the past
 *   → manually enqueue mark-overdue job via BullMQ
 *   → MarkOverdueAssignmentsWorker processes it
 *   → learning.assignment.overdue published exactly once
 *   → assignment.status = OVERDUE in DB
 *   → re-run job: no duplicate event (idempotent)
 */

import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { LEARNING_EVENT_TYPES } from '@ssz/contracts/events';
import { InfraContainers } from '../helpers/infra.js';
import { ServiceProcess } from '../helpers/services.js';
import { AmqpEventCapture } from '../helpers/amqp.js';
import { DatabaseClient, createDatabase } from '../helpers/db.js';
import { StubServer } from '../helpers/stub-server.js';
import { createJwtHelper } from '../helpers/jwt.js';
import { createClient } from '../helpers/http.js';

const LEARNING_PORT = 3103;
// Job name must match MarkOverdueAssignmentsWorker constant
const MARK_OVERDUE_JOB = 'mark-overdue';

describe('Scenario 3 — Overdue assignment job', () => {
  const infra = new InfraContainers();
  const learning = new ServiceProcess();
  const events = new AmqpEventCapture();
  const db = new DatabaseClient();
  const contentStub = new StubServer();
  const orgStub = new StubServer();

  const CONTENT_ID = randomUUID();
  const SCHOOL_ID = randomUUID();
  const TUTOR_ID = randomUUID();
  const STUDENT_ID = randomUUID();

  let learningUrl: string;
  let redisPort: number;
  let redisPassword: string;
  let jwtHelper: ReturnType<typeof createJwtHelper>;

  beforeAll(async () => {
    const ports = await infra.start();
    await createDatabase(ports.postgresUrl, 'learning_s3');

    redisPort = ports.redisPort;
    redisPassword = ports.redisPassword;
    jwtHelper = createJwtHelper();

    // Content stub: checkVisibilityForUser → visible
    contentStub.register(
      'GET',
      /\/api\/internal\/content-items/,
      (url) => {
        if (url.pathname.endsWith('/visibility')) return { status: 200, body: { isVisible: true } };
        return { status: 200, body: { id: CONTENT_ID, type: 'EXERCISE', title: 'Test Exercise' } };
      },
    );
    // Org stub: tutor = TEACHER, student = STUDENT
    orgStub.register('GET', /\/schools\/.*\/members\/.*\/role/, (url) => {
      const userId = url.pathname.split('/').pop()!;
      const role = userId === TUTOR_ID ? 'TEACHER' : 'STUDENT';
      return { status: 200, body: { role } };
    });
    await Promise.all([contentStub.start(), orgStub.start()]);

    learningUrl = await learning.start('learning-service', LEARNING_PORT, {
      databaseUrl: ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s3'),
      rabbitmqUrl: ports.rabbitmqUrl,
      redisHost: ports.redisHost,
      redisPort: ports.redisPort,
      redisPassword: ports.redisPassword,
      redisDb: 4,
      jwtPublicKey: jwtHelper.publicKey,
      contentServiceUrl: contentStub.url,
      orgServiceUrl: orgStub.url,
    });

    await events.connect(ports.rabbitmqUrl, [LEARNING_EVENT_TYPES.ASSIGNMENT_OVERDUE]);
    db.connect(ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s3'));
  }, 120_000);

  afterAll(async () => {
    await events.disconnect();
    await db.close();
    learning.stop();
    await Promise.all([contentStub.stop(), orgStub.stop()]);
    await infra.stop();
  });

  it('marks overdue assignment exactly once; re-run produces no duplicate event', async () => {
    const tutorClient = createClient(learningUrl, jwtHelper.makeToken(TUTOR_ID, ['tutor']));

    // 1. Create assignment with dueAt in the past
    const pastDueAt = new Date(Date.now() - 3_600_000).toISOString(); // 1 hour ago
    const createRes = await tutorClient.post('/assignments', {
      assigneeId: STUDENT_ID,
      schoolId: SCHOOL_ID,
      contentType: 'EXERCISE',
      contentId: CONTENT_ID,
      dueAt: pastDueAt,
    });
    expect(createRes.status).toBe(201);
    const assignmentId: string = createRes.data.id;

    // 2. Trigger the worker by enqueuing a job directly on the BullMQ queue via Redis
    const redis = new Redis({
      host: '127.0.0.1',
      port: redisPort,
      password: redisPassword,
      lazyConnect: true,
    });
    await redis.connect();
    const queue = new Queue('assignments', { connection: redis });
    await queue.add(MARK_OVERDUE_JOB, {}, { removeOnComplete: true });

    // 3. Wait for learning.assignment.overdue
    const overdueEvent = await events.waitFor(
      (e) =>
        e.eventType === LEARNING_EVENT_TYPES.ASSIGNMENT_OVERDUE &&
        (e.payload as { assignmentId: string }).assignmentId === assignmentId,
      30_000,
    );
    expect(overdueEvent.payload).toMatchObject({ assignmentId, assignerId: TUTOR_ID });

    // 4. DB confirms status = OVERDUE
    const row = await db.queryOne(
      `SELECT status FROM assignments WHERE id = $1`,
      [assignmentId],
    );
    expect(row!['status']).toBe('overdue');

    // 5. Re-run job — must produce NO duplicate overdue event
    events.clear();
    await queue.add(MARK_OVERDUE_JOB, {}, { removeOnComplete: true });
    await events.assertNone(
      (e) =>
        e.eventType === LEARNING_EVENT_TYPES.ASSIGNMENT_OVERDUE &&
        (e.payload as { assignmentId: string }).assignmentId === assignmentId,
      5_000,
    );

    await queue.close();
    await redis.quit();
  });
});
