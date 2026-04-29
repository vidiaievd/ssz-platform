import { Assignment } from '../../../../../src/modules/assignments/domain/entities/assignment.entity.js';
import { ContentRef } from '../../../../../src/shared/domain/value-objects/content-ref.js';
import {
  AssignmentAlreadyCancelledError,
  AssignmentAlreadyCompletedError,
  AssignmentDueDateInPastError,
  CannotAssignToSelfError,
  InvalidAssignmentTransitionError,
} from '../../../../../src/modules/assignments/domain/exceptions/assignment.errors.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ASSIGNER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ASSIGNEE_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const SCHOOL_ID   = 'cccccccc-0000-4000-8000-000000000003';
const CONTENT_ID  = 'dddddddd-0000-4000-8000-000000000004';

const makeClock = (date: Date): IClock => ({ now: () => date });

const NOW  = new Date('2026-01-01T12:00:00Z');
const FUTURE = new Date('2026-06-01T12:00:00Z');
const PAST   = new Date('2025-06-01T12:00:00Z');

const contentRef = ContentRef.create('LESSON', CONTENT_ID).value;

const makeAssignment = (overrides: Partial<Parameters<typeof Assignment.create>[0]> = {}) =>
  Assignment.create(
    {
      assignerId: ASSIGNER_ID,
      assigneeId: ASSIGNEE_ID,
      schoolId: SCHOOL_ID,
      contentRef,
      dueAt: FUTURE,
      ...overrides,
    },
    makeClock(NOW),
  );

// ── Creation ──────────────────────────────────────────────────────────────────

describe('Assignment.create', () => {
  it('creates an active assignment and raises AssignmentCreatedEvent', () => {
    const result = makeAssignment();

    expect(result.isOk).toBe(true);
    const a = result.value;
    expect(a.status).toBe('ACTIVE');
    expect(a.assignerId).toBe(ASSIGNER_ID);
    expect(a.assigneeId).toBe(ASSIGNEE_ID);
    expect(a.schoolId).toBe(SCHOOL_ID);
    expect(a.dueAt).toEqual(FUTURE);
    expect(a.completedAt).toBeNull();
    expect(a.cancelledAt).toBeNull();

    const events = a.getDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('learning.assignment.created');
    expect(events[0].aggregateId).toBe(a.id);
  });

  it('fails when assigner and assignee are the same user', () => {
    const result = makeAssignment({ assigneeId: ASSIGNER_ID });

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(CannotAssignToSelfError);
  });

  it('fails when due date is in the past', () => {
    const result = makeAssignment({ dueAt: PAST });

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AssignmentDueDateInPastError);
  });

  it('fails when due date equals now', () => {
    const result = makeAssignment({ dueAt: NOW });

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AssignmentDueDateInPastError);
  });

  it('stores optional notes', () => {
    const result = makeAssignment({ notes: 'Focus on chapter 3' });

    expect(result.value.notes).toBe('Focus on chapter 3');
  });

  it('defaults schoolId to null when not provided', () => {
    const result = makeAssignment({ schoolId: undefined });

    expect(result.value.schoolId).toBeNull();
  });
});

// ── cancel() ─────────────────────────────────────────────────────────────────

describe('Assignment#cancel', () => {
  it('cancels an active assignment and raises AssignmentCancelledEvent', () => {
    const a = makeAssignment().value;

    const result = a.cancel('no longer needed');

    expect(result.isOk).toBe(true);
    expect(a.status).toBe('CANCELLED');
    expect(a.cancelledAt).not.toBeNull();
    expect(a.cancelledReason).toBe('no longer needed');

    const events = a.getDomainEvents();
    expect(events[events.length - 1].eventType).toBe('learning.assignment.cancelled');
  });

  it('cancels without a reason', () => {
    const a = makeAssignment().value;
    a.cancel();

    expect(a.cancelledReason).toBeNull();
  });

  it('cancels an overdue assignment', () => {
    const a = makeAssignment().value;
    a.markOverdue();
    const result = a.cancel();

    expect(result.isOk).toBe(true);
    expect(a.status).toBe('CANCELLED');
  });

  it('fails when assignment is already cancelled', () => {
    const a = makeAssignment().value;
    a.cancel();

    const result = a.cancel();
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AssignmentAlreadyCancelledError);
  });

  it('fails when assignment is already completed', () => {
    const a = makeAssignment().value;
    a.markComplete();

    const result = a.cancel();
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AssignmentAlreadyCompletedError);
  });
});

// ── markComplete() ────────────────────────────────────────────────────────────

describe('Assignment#markComplete', () => {
  it('completes an active assignment and raises AssignmentCompletedEvent', () => {
    const a = makeAssignment().value;

    const result = a.markComplete();

    expect(result.isOk).toBe(true);
    expect(a.status).toBe('COMPLETED');
    expect(a.completedAt).not.toBeNull();

    const events = a.getDomainEvents();
    expect(events[events.length - 1].eventType).toBe('learning.assignment.completed');
  });

  it('completes an overdue assignment', () => {
    const a = makeAssignment().value;
    a.markOverdue();

    const result = a.markComplete();
    expect(result.isOk).toBe(true);
    expect(a.status).toBe('COMPLETED');
  });

  it('is idempotent when already completed', () => {
    const a = makeAssignment().value;
    a.markComplete();
    const eventsBefore = a.getDomainEvents().length;

    const result = a.markComplete();
    expect(result.isOk).toBe(true);
    expect(a.getDomainEvents()).toHaveLength(eventsBefore);
  });

  it('fails when assignment is cancelled', () => {
    const a = makeAssignment().value;
    a.cancel();

    const result = a.markComplete();
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidAssignmentTransitionError);
  });
});

// ── markOverdue() ─────────────────────────────────────────────────────────────

describe('Assignment#markOverdue', () => {
  it('marks an active assignment overdue and raises event', () => {
    const a = makeAssignment().value;

    const result = a.markOverdue();

    expect(result.isOk).toBe(true);
    expect(a.status).toBe('OVERDUE');

    const events = a.getDomainEvents();
    expect(events[events.length - 1].eventType).toBe('learning.assignment.overdue');
  });

  it('is idempotent when already overdue', () => {
    const a = makeAssignment().value;
    a.markOverdue();
    const eventsBefore = a.getDomainEvents().length;

    const result = a.markOverdue();
    expect(result.isOk).toBe(true);
    expect(a.getDomainEvents()).toHaveLength(eventsBefore);
  });

  it('fails when assignment is completed', () => {
    const a = makeAssignment().value;
    a.markComplete();

    const result = a.markOverdue();
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidAssignmentTransitionError);
  });

  it('fails when assignment is cancelled', () => {
    const a = makeAssignment().value;
    a.cancel();

    const result = a.markOverdue();
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidAssignmentTransitionError);
  });
});

// ── updateDueDate() ───────────────────────────────────────────────────────────

describe('Assignment#updateDueDate', () => {
  it('updates the due date on an active assignment and raises event', () => {
    const a = makeAssignment().value;
    const newDue = new Date('2026-12-01T12:00:00Z');

    const result = a.updateDueDate(newDue, makeClock(NOW));

    expect(result.isOk).toBe(true);
    expect(a.dueAt).toEqual(newDue);

    const events = a.getDomainEvents();
    const event = events[events.length - 1];
    expect(event.eventType).toBe('learning.assignment.due_date_updated');
    expect((event as any).payload.previousDueAt).toEqual(FUTURE.toISOString());
    expect((event as any).payload.newDueAt).toEqual(newDue.toISOString());
  });

  it('fails when new due date is in the past', () => {
    const a = makeAssignment().value;

    const result = a.updateDueDate(PAST, makeClock(NOW));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(AssignmentDueDateInPastError);
  });

  it('fails on a cancelled assignment', () => {
    const a = makeAssignment().value;
    a.cancel();

    const result = a.updateDueDate(FUTURE, makeClock(NOW));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidAssignmentTransitionError);
  });

  it('fails on a completed assignment', () => {
    const a = makeAssignment().value;
    a.markComplete();

    const result = a.updateDueDate(FUTURE, makeClock(NOW));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidAssignmentTransitionError);
  });

  it('fails on an overdue assignment', () => {
    const a = makeAssignment().value;
    a.markOverdue();

    const result = a.updateDueDate(FUTURE, makeClock(NOW));
    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidAssignmentTransitionError);
  });
});

// ── updateNotes() ─────────────────────────────────────────────────────────────

describe('Assignment#updateNotes', () => {
  it('updates notes', () => {
    const a = makeAssignment().value;
    a.updateNotes('new notes');
    expect(a.notes).toBe('new notes');
  });

  it('clears notes when null passed', () => {
    const a = makeAssignment({ notes: 'original' }).value;
    a.updateNotes(null);
    expect(a.notes).toBeNull();
  });
});

// ── reconstitute() ────────────────────────────────────────────────────────────

describe('Assignment.reconstitute', () => {
  it('restores from persistence without raising events', () => {
    const a = Assignment.reconstitute({
      id: 'eeeeeeee-0000-4000-8000-000000000005',
      assignerId: ASSIGNER_ID,
      assigneeId: ASSIGNEE_ID,
      schoolId: SCHOOL_ID,
      contentRef,
      status: 'OVERDUE',
      assignedAt: NOW,
      dueAt: PAST,
      completedAt: null,
      cancelledAt: null,
      cancelledReason: null,
      notes: null,
      deletedAt: null,
    });

    expect(a.status).toBe('OVERDUE');
    expect(a.getDomainEvents()).toHaveLength(0);
  });
});
