import { jest } from '@jest/globals';
import { MarkOverdueAssignmentsWorker, MARK_OVERDUE_JOB } from '../../../../src/modules/jobs/mark-overdue-assignments.worker.js';
import { Assignment } from '../../../../src/modules/assignments/domain/entities/assignment.entity.js';
import { ContentRef } from '../../../../src/shared/domain/value-objects/content-ref.js';
import type { IAssignmentRepository } from '../../../../src/modules/assignments/domain/repositories/assignment.repository.interface.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../src/shared/application/ports/clock.port.js';
import type { Job } from 'bullmq';

const NOW = new Date('2026-04-01T06:00:00Z');

const mockFn = () => jest.fn<() => Promise<unknown>>();

function activeAssignment(): Assignment {
  return Assignment.reconstitute({
    id: 'assign-aaa',
    assignerId: 'teacher-001',
    assigneeId: 'student-001',
    schoolId: 'school-001',
    contentRef: ContentRef.fromPersistence('LESSON', '882eed2f-be9b-464b-93eb-b487971647ae'),
    status: 'ACTIVE',
    assignedAt: new Date('2026-01-01T00:00:00Z'),
    dueAt: new Date('2026-03-01T00:00:00Z'),
    completedAt: null,
    cancelledAt: null,
    cancelledReason: null,
    notes: null,
    deletedAt: null,
  });
}

function cancelledAssignment(): Assignment {
  return Assignment.reconstitute({
    id: 'assign-bbb',
    assignerId: 'teacher-001',
    assigneeId: 'student-001',
    schoolId: null,
    contentRef: ContentRef.fromPersistence('LESSON', 'd447a7a1-1805-46f3-913e-a6a368420c4a'),
    status: 'CANCELLED',
    assignedAt: new Date('2026-01-01T00:00:00Z'),
    dueAt: new Date('2026-03-01T00:00:00Z'),
    completedAt: null,
    cancelledAt: new Date('2026-02-01T00:00:00Z'),
    cancelledReason: 'cancelled',
    notes: null,
    deletedAt: null,
  });
}

const makeWorker = (overrides: Partial<{
  repo: IAssignmentRepository;
  publisher: IEventPublisher;
  clock: IClock;
}> = {}) => {
  const repo = (overrides.repo ?? {
    findById: jest.fn(),
    findByAssignee: jest.fn(),
    findByAssigner: jest.fn(),
    findOverdueCandidates: mockFn().mockResolvedValue([]),
    save: mockFn().mockResolvedValue(undefined),
    softDelete: jest.fn(),
  }) as unknown as IAssignmentRepository;

  const publisher = (overrides.publisher ?? {
    publish: mockFn().mockResolvedValue(undefined),
  }) as unknown as IEventPublisher;

  const clock: IClock = overrides.clock ?? { now: () => NOW };

  return { worker: new MarkOverdueAssignmentsWorker(repo, publisher, clock), repo, publisher };
};

const makeJob = (name: string): Job => ({ name } as unknown as Job);

describe('MarkOverdueAssignmentsWorker', () => {
  it('does nothing when job name does not match', async () => {
    const { worker, repo } = makeWorker();

    await worker.process(makeJob('some-other-job'));

    expect(repo.findOverdueCandidates).not.toHaveBeenCalled();
  });

  it('does nothing when there are no overdue candidates', async () => {
    const { worker, repo, publisher } = makeWorker();

    await worker.process(makeJob(MARK_OVERDUE_JOB));

    expect(repo.findOverdueCandidates).toHaveBeenCalledWith(NOW);
    expect(repo.save).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('marks active candidates as overdue, saves, and publishes events', async () => {
    const candidate = activeAssignment();
    const { worker, repo, publisher } = makeWorker({
      repo: {
        findById: jest.fn(),
        findByAssignee: jest.fn(),
        findByAssigner: jest.fn(),
        findOverdueCandidates: mockFn().mockResolvedValue([candidate]),
        save: mockFn().mockResolvedValue(undefined),
        softDelete: jest.fn(),
      } as unknown as IAssignmentRepository,
    });

    await worker.process(makeJob(MARK_OVERDUE_JOB));

    expect(candidate.status).toBe('OVERDUE');
    expect(repo.save).toHaveBeenCalledWith(candidate);
    expect(publisher.publish).toHaveBeenCalledWith(
      'learning.assignment.overdue',
      expect.any(Object),
    );
  });

  it('clears domain events after publishing', async () => {
    const candidate = activeAssignment();
    const { worker } = makeWorker({
      repo: {
        findById: jest.fn(),
        findByAssignee: jest.fn(),
        findByAssigner: jest.fn(),
        findOverdueCandidates: mockFn().mockResolvedValue([candidate]),
        save: mockFn().mockResolvedValue(undefined),
        softDelete: jest.fn(),
      } as unknown as IAssignmentRepository,
    });

    await worker.process(makeJob(MARK_OVERDUE_JOB));

    expect(candidate.getDomainEvents()).toHaveLength(0);
  });

  it('skips candidates where markOverdue fails (e.g., already cancelled)', async () => {
    const bad = cancelledAssignment();
    const good = activeAssignment();
    const { worker, repo, publisher } = makeWorker({
      repo: {
        findById: jest.fn(),
        findByAssignee: jest.fn(),
        findByAssigner: jest.fn(),
        findOverdueCandidates: mockFn().mockResolvedValue([bad, good]),
        save: mockFn().mockResolvedValue(undefined),
        softDelete: jest.fn(),
      } as unknown as IAssignmentRepository,
    });

    await worker.process(makeJob(MARK_OVERDUE_JOB));

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(good);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });
});
