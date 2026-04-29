import { jest } from '@jest/globals';
import { ContainerDeletedConsumer } from '../../../../src/modules/events/consumers/container-deleted.consumer.js';
import { Assignment } from '../../../../src/modules/assignments/domain/entities/assignment.entity.js';
import { Enrollment } from '../../../../src/modules/enrollments/domain/entities/enrollment.entity.js';
import { ContentRef } from '../../../../src/shared/domain/value-objects/content-ref.js';
import type { IAssignmentRepository } from '../../../../src/modules/assignments/domain/repositories/assignment.repository.interface.js';
import type { IEnrollmentRepository } from '../../../../src/modules/enrollments/domain/repositories/enrollment.repository.interface.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';
import type { IContainerItemListCache } from '../../../../src/shared/application/ports/container-item-list-cache.port.js';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';

const CONTAINER_ID = 'cccccccc-0000-4000-8000-000000000001';

function makeMsg(content: unknown): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(content)) } as unknown as ConsumeMessage;
}

function makeChannel(): jest.Mocked<Pick<ConfirmChannel, 'ack' | 'nack'>> {
  return { ack: jest.fn(), nack: jest.fn() } as any;
}

function activeAssignment(): Assignment {
  return Assignment.reconstitute({
    id: 'assign-001',
    assignerId: 'teacher-001',
    assigneeId: 'student-001',
    schoolId: 'school-001',
    contentRef: ContentRef.fromPersistence('CONTAINER', CONTAINER_ID),
    status: 'ACTIVE',
    assignedAt: new Date('2026-01-01T00:00:00Z'),
    dueAt: new Date('2026-12-01T00:00:00Z'),
    completedAt: null,
    cancelledAt: null,
    cancelledReason: null,
    notes: null,
    deletedAt: null,
  });
}

function activeEnrollment(): Enrollment {
  return Enrollment.reconstitute({
    id: 'enroll-001',
    userId: 'student-001',
    containerId: CONTAINER_ID,
    schoolId: null,
    status: 'ACTIVE',
    enrolledAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    unenrolledAt: null,
    unenrollReason: null,
    deletedAt: null,
  });
}

function makeConsumer(overrides: {
  processedEvent?: { findUnique: any; create: any };
  assignmentRepo?: Partial<IAssignmentRepository>;
  enrollmentRepo?: Partial<IEnrollmentRepository>;
  publisher?: Partial<IEventPublisher>;
  cache?: Partial<IContainerItemListCache>;
}) {
  const prisma = {
    processedEvent: {
      findUnique: overrides.processedEvent?.findUnique ?? jest.fn<() => Promise<null>>().mockResolvedValue(null),
      create: overrides.processedEvent?.create ?? jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as any;

  const config = { get: jest.fn().mockReturnValue(undefined) } as any;

  const assignmentRepo: IAssignmentRepository = {
    findById: jest.fn(),
    findByAssignee: jest.fn(),
    findByAssigner: jest.fn(),
    findOverdueCandidates: jest.fn(),
    findActiveByContent: jest.fn<() => Promise<Assignment[]>>().mockResolvedValue([]),
    save: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    softDelete: jest.fn(),
    ...overrides.assignmentRepo,
  } as unknown as IAssignmentRepository;

  const enrollmentRepo: IEnrollmentRepository = {
    findById: jest.fn(),
    findByUserAndContainer: jest.fn(),
    findByUser: jest.fn(),
    findActiveByContainerId: jest.fn<() => Promise<Enrollment[]>>().mockResolvedValue([]),
    save: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    softDelete: jest.fn(),
    ...overrides.enrollmentRepo,
  } as unknown as IEnrollmentRepository;

  const publisher: IEventPublisher = {
    publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ...overrides.publisher,
  };

  const cache: IContainerItemListCache = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ...overrides.cache,
  };

  return {
    consumer: new ContainerDeletedConsumer(prisma, config, assignmentRepo, enrollmentRepo, publisher, cache),
    prisma,
    assignmentRepo,
    enrollmentRepo,
    publisher,
    cache,
  };
}

const validEnvelope = {
  eventId: 'evt-del-001',
  eventType: 'content.container.deleted',
  payload: { containerId: CONTAINER_ID, ownerUserId: 'user-001' },
};

describe('ContainerDeletedConsumer', () => {
  describe('handleMessage', () => {
    it('cascades cancel + unenroll, invalidates cache, marks processed, and acks', async () => {
      const assignment = activeAssignment();
      const enrollment = activeEnrollment();
      const { consumer, assignmentRepo, enrollmentRepo, publisher, cache, prisma } = makeConsumer({
        assignmentRepo: {
          findActiveByContent: jest.fn<() => Promise<Assignment[]>>().mockResolvedValue([assignment]),
        },
        enrollmentRepo: {
          findActiveByContainerId: jest.fn<() => Promise<Enrollment[]>>().mockResolvedValue([enrollment]),
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(validEnvelope));

      // assignment cancelled
      expect(assignment.status).toBe('CANCELLED');
      expect(assignment.cancelledReason).toBe('content_deleted');
      expect(assignmentRepo.save).toHaveBeenCalledWith(assignment);

      // enrollment unenrolled
      expect(enrollment.status).toBe('UNENROLLED');
      expect(enrollment.unenrollReason).toBe('content_deleted');
      expect(enrollmentRepo.save).toHaveBeenCalledWith(enrollment);

      // events published
      expect(publisher.publish).toHaveBeenCalledWith(
        'learning.assignment.cancelled',
        expect.objectContaining({ assignmentId: 'assign-001', reason: 'content_deleted' }),
      );
      expect(publisher.publish).toHaveBeenCalledWith(
        'learning.enrollment.unenrolled',
        expect.objectContaining({ enrollmentId: 'enroll-001', reason: 'content_deleted' }),
      );

      expect(cache.invalidate).toHaveBeenCalledWith(CONTAINER_ID);
      expect(prisma.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-del-001', eventType: 'content.container.deleted' },
      });
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('skips processing and acks duplicate event (idempotent re-delivery)', async () => {
      const { consumer, assignmentRepo, cache } = makeConsumer({
        processedEvent: {
          findUnique: jest.fn<() => Promise<object>>().mockResolvedValue({ eventId: 'evt-del-001' }),
          create: jest.fn(),
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(validEnvelope));

      expect(assignmentRepo.findActiveByContent).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('nacks without requeue on malformed JSON', async () => {
      const { consumer } = makeConsumer({});
      const channel = makeChannel();
      const badMsg = { content: Buffer.from('}}bad{{') } as unknown as ConsumeMessage;

      await (consumer as any).handleMessage(channel, badMsg);

      expect(channel.nack).toHaveBeenCalledWith(badMsg, false, false);
    });

    it('continues cascade when one assignment save fails (per-record isolation)', async () => {
      const a1 = activeAssignment();
      const a2 = Assignment.reconstitute({ ...activeAssignment(), id: 'assign-002' } as any);

      const saveMock = jest.fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue(undefined);

      const { consumer, publisher } = makeConsumer({
        assignmentRepo: {
          findActiveByContent: jest.fn<() => Promise<Assignment[]>>().mockResolvedValue([a1, a2]),
          save: saveMock,
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(validEnvelope));

      // second assignment still saved despite first failing
      expect(saveMock).toHaveBeenCalledTimes(2);
      // only second assignment's event published (first save threw before publish)
      expect(publisher.publish).toHaveBeenCalledTimes(1);
      // consumer still acked overall
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no active assignments or enrollments reference the container', async () => {
      const { consumer, publisher, cache, prisma } = makeConsumer({});
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(validEnvelope));

      expect(publisher.publish).not.toHaveBeenCalled();
      expect(cache.invalidate).toHaveBeenCalledWith(CONTAINER_ID);
      expect(prisma.processedEvent.create).toHaveBeenCalledTimes(1);
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });
  });
});
