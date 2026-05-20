/**
 * Scenario 5 — Container deletion cascade
 *
 *   Create active assignment (contentType=CONTAINER) + active enrollment
 *   both referencing the same container
 *   → publish content.container.deleted to RabbitMQ
 *   → ContainerDeletedConsumer cancels both records
 *   → assignment.cancelled_reason = 'content_deleted' and enrollment.unenroll_reason = 'content_deleted'
 *   → learning.assignment.cancelled + learning.enrollment.unenrolled published
 */

import { randomUUID } from 'node:crypto';
import { CONTENT_EVENT_TYPES, LEARNING_EVENT_TYPES } from '@ssz/contracts/events';
import { InfraContainers } from '../helpers/infra.js';
import { ServiceProcess } from '../helpers/services.js';
import { AmqpEventCapture } from '../helpers/amqp.js';
import { DatabaseClient, createDatabase } from '../helpers/db.js';
import { StubServer } from '../helpers/stub-server.js';
import { createJwtHelper } from '../helpers/jwt.js';
import { createClient } from '../helpers/http.js';

const LEARNING_PORT = 3105;

describe('Scenario 5 — Container deletion cascade', () => {
  const infra = new InfraContainers();
  const learning = new ServiceProcess();
  const events = new AmqpEventCapture();
  const db = new DatabaseClient();
  const contentStub = new StubServer();
  const orgStub = new StubServer();

  const CONTAINER_ID = randomUUID();
  const SCHOOL_ID = randomUUID();
  const TUTOR_ID = randomUUID();
  const STUDENT_ID = randomUUID();

  let learningUrl: string;
  let jwtHelper: ReturnType<typeof createJwtHelper>;

  beforeAll(async () => {
    const ports = await infra.start();
    await createDatabase(ports.postgresUrl, 'learning_s5');

    jwtHelper = createJwtHelper();

    // Content stub:
    //   checkVisibilityForUser → visible (for create assignment)
    //   getAccessTier (for enroll) → FREE_WITHIN_SCHOOL
    contentStub
      .register('GET', /\/api\/internal\/content-items\/.*\/visibility/, () => ({
        status: 200,
        body: { isVisible: true },
      }))
      .register('GET', /\/api\/internal\/containers\/.*\/access-tier/, () => ({
        status: 200,
        body: { accessTier: 'FREE_WITHIN_SCHOOL' },
      }))
      .register('GET', '/api/internal', () => ({
        status: 200,
        body: { id: CONTAINER_ID, type: 'CONTAINER', title: 'Test Course' },
      }));

    // Org stub: tutor = TEACHER, student = STUDENT
    orgStub.register('GET', /\/schools\/.*\/members\/.*\/role/, (url) => {
      const userId = url.pathname.split('/').pop()!;
      const role = userId === TUTOR_ID ? 'TEACHER' : 'STUDENT';
      return { status: 200, body: { role } };
    });

    await Promise.all([contentStub.start(), orgStub.start()]);

    learningUrl = await learning.start('learning-service', LEARNING_PORT, {
      databaseUrl: ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s5'),
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
      LEARNING_EVENT_TYPES.ASSIGNMENT_CANCELLED,
      LEARNING_EVENT_TYPES.ENROLLMENT_UNENROLLED,
    ]);
    db.connect(ports.postgresUrl.replace(/\/[^/]+$/, '/learning_s5'));
  }, 120_000);

  afterAll(async () => {
    await events.disconnect();
    await db.close();
    learning.stop();
    await Promise.all([contentStub.stop(), orgStub.stop()]);
    await infra.stop();
  });

  it('soft-cancels assignment and enrollment, publishes both events', async () => {
    const tutorClient = createClient(learningUrl, jwtHelper.makeToken(TUTOR_ID, ['tutor']));
    const studentClient = createClient(learningUrl, jwtHelper.makeToken(STUDENT_ID, ['student']));

    // 1. Create active assignment (CONTAINER content type)
    const futureDueAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const assignRes = await tutorClient.post('/assignments', {
      assigneeId: STUDENT_ID,
      schoolId: SCHOOL_ID,
      contentType: 'CONTAINER',
      contentId: CONTAINER_ID,
      dueAt: futureDueAt,
    });
    expect(assignRes.status).toBe(201);
    const assignmentId: string = assignRes.data.id;

    // 2. Student enrolls in the same container
    const enrollRes = await studentClient.post('/enrollments', {
      containerId: CONTAINER_ID,
      schoolId: SCHOOL_ID,
    });
    expect(enrollRes.status).toBe(201);
    const enrollmentId: string = enrollRes.data.id;

    // 3. Publish content.container.deleted
    await events.publish(CONTENT_EVENT_TYPES.CONTAINER_DELETED, {
      containerId: CONTAINER_ID,
    });

    // 4. Wait for both cancellation events
    const cancelledEvent = await events.waitFor(
      (e) =>
        e.eventType === LEARNING_EVENT_TYPES.ASSIGNMENT_CANCELLED &&
        (e.payload as { assignmentId: string }).assignmentId === assignmentId,
      30_000,
    );
    expect(cancelledEvent.payload).toMatchObject({ assignmentId });

    const unenrolledEvent = await events.waitFor(
      (e) =>
        e.eventType === LEARNING_EVENT_TYPES.ENROLLMENT_UNENROLLED &&
        (e.payload as { enrollmentId: string }).enrollmentId === enrollmentId,
      30_000,
    );
    expect(unenrolledEvent.payload).toMatchObject({ enrollmentId });

    // 5. DB confirms soft-cancellation with reason 'content_deleted'
    const assignRow = await db.queryOne(
      `SELECT status, cancelled_reason FROM assignments WHERE id = $1`,
      [assignmentId],
    );
    expect(assignRow!['status']).toBe('cancelled');
    expect(assignRow!['cancelled_reason']).toBe('content_deleted');

    const enrollRow = await db.queryOne(
      `SELECT status, unenroll_reason FROM enrollments WHERE id = $1`,
      [enrollmentId],
    );
    expect(enrollRow!['status']).toBe('unenrolled');
    expect(enrollRow!['unenroll_reason']).toBe('content_deleted');
  });
});
