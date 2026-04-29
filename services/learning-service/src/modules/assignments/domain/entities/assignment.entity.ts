import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { ContentRef } from '../../../../shared/domain/value-objects/content-ref.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { IClock } from '../../../../shared/application/ports/clock.port.js';
import { AssignmentDueDate } from '../value-objects/assignment-due-date.vo.js';
import {
  AssignmentAlreadyCancelledError,
  AssignmentAlreadyCompletedError,
  AssignmentDueDateInPastError,
  CannotAssignToSelfError,
  InvalidAssignmentTransitionError,
  type AssignmentDomainError,
} from '../exceptions/assignment.errors.js';
import { AssignmentCreatedEvent } from '../events/assignment-created.event.js';
import { AssignmentCancelledEvent } from '../events/assignment-cancelled.event.js';
import { AssignmentCompletedEvent } from '../events/assignment-completed.event.js';
import { AssignmentMarkedOverdueEvent } from '../events/assignment-marked-overdue.event.js';
import { AssignmentDueDateUpdatedEvent } from '../events/assignment-due-date-updated.event.js';

export type AssignmentStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE';

export interface CreateAssignmentProps {
  assignerId: string;
  assigneeId: string;
  schoolId?: string | null;
  contentRef: ContentRef;
  dueAt: Date;
  notes?: string;
}

export interface AssignmentPersistenceProps {
  id: string;
  assignerId: string;
  assigneeId: string;
  schoolId: string | null;
  contentRef: ContentRef;
  status: AssignmentStatus;
  assignedAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  notes: string | null;
  deletedAt: Date | null;
}

export class Assignment extends AggregateRoot {
  private constructor(
    id: string,
    private _assignerId: string,
    private _assigneeId: string,
    private _schoolId: string | null,
    private _contentRef: ContentRef,
    private _status: AssignmentStatus,
    private _assignedAt: Date,
    private _dueAt: Date,
    private _completedAt: Date | null,
    private _cancelledAt: Date | null,
    private _cancelledReason: string | null,
    private _notes: string | null,
    private _deletedAt: Date | null,
  ) {
    super(id);
  }

  // Creates a new assignment, validates invariants, raises AssignmentCreatedEvent.
  static create(
    props: CreateAssignmentProps,
    clock: IClock,
  ): Result<Assignment, AssignmentDomainError> {
    if (props.assignerId === props.assigneeId) {
      return Result.fail(new CannotAssignToSelfError());
    }

    const dueDateResult = AssignmentDueDate.create(props.dueAt, clock.now());
    if (dueDateResult.isFail) {
      return Result.fail(dueDateResult.error);
    }

    const now = clock.now();
    const assignment = new Assignment(
      randomUUID(),
      props.assignerId,
      props.assigneeId,
      props.schoolId ?? null,
      props.contentRef,
      'ACTIVE',
      now,
      props.dueAt,
      null,
      null,
      null,
      props.notes ?? null,
      null,
    );

    assignment.addDomainEvent(
      new AssignmentCreatedEvent(assignment.id, {
        assignmentId: assignment.id,
        assignerId: assignment._assignerId,
        assigneeId: assignment._assigneeId,
        schoolId: assignment._schoolId,
        contentType: assignment._contentRef.type,
        contentId: assignment._contentRef.id,
        dueAt: assignment._dueAt.toISOString(),
      }),
    );

    return Result.ok(assignment);
  }

  // Restores an assignment from persistence — no validation, no events.
  static reconstitute(props: AssignmentPersistenceProps): Assignment {
    return new Assignment(
      props.id,
      props.assignerId,
      props.assigneeId,
      props.schoolId,
      props.contentRef,
      props.status,
      props.assignedAt,
      props.dueAt,
      props.completedAt,
      props.cancelledAt,
      props.cancelledReason,
      props.notes,
      props.deletedAt,
    );
  }

  cancel(
    reason?: string,
  ): Result<void, AssignmentAlreadyCancelledError | AssignmentAlreadyCompletedError> {
    if (this._status === 'CANCELLED') {
      return Result.fail(new AssignmentAlreadyCancelledError());
    }
    if (this._status === 'COMPLETED') {
      return Result.fail(new AssignmentAlreadyCompletedError());
    }

    this._status = 'CANCELLED';
    this._cancelledAt = new Date();
    this._cancelledReason = reason ?? null;

    this.addDomainEvent(
      new AssignmentCancelledEvent(this.id, {
        assignmentId: this.id,
        assignerId: this._assignerId,
        assigneeId: this._assigneeId,
        reason: this._cancelledReason,
      }),
    );

    return Result.ok();
  }

  // Idempotent: completing an already-completed assignment is a no-op.
  markComplete(): Result<void, InvalidAssignmentTransitionError> {
    if (this._status === 'COMPLETED') {
      return Result.ok();
    }
    if (this._status !== 'ACTIVE' && this._status !== 'OVERDUE') {
      return Result.fail(
        new InvalidAssignmentTransitionError(
          `cannot complete assignment with status ${this._status}`,
        ),
      );
    }

    this._status = 'COMPLETED';
    this._completedAt = new Date();

    this.addDomainEvent(
      new AssignmentCompletedEvent(this.id, {
        assignmentId: this.id,
        assignerId: this._assignerId,
        assigneeId: this._assigneeId,
      }),
    );

    return Result.ok();
  }

  // Idempotent: marking an already-overdue assignment is a no-op.
  markOverdue(): Result<void, InvalidAssignmentTransitionError> {
    if (this._status === 'OVERDUE') {
      return Result.ok();
    }
    if (this._status !== 'ACTIVE') {
      return Result.fail(
        new InvalidAssignmentTransitionError(
          `cannot mark overdue: assignment has status ${this._status}`,
        ),
      );
    }

    this._status = 'OVERDUE';

    this.addDomainEvent(
      new AssignmentMarkedOverdueEvent(this.id, {
        assignmentId: this.id,
        assignerId: this._assignerId,
        assigneeId: this._assigneeId,
        dueAt: this._dueAt.toISOString(),
      }),
    );

    return Result.ok();
  }

  updateDueDate(
    newDueAt: Date,
    clock: IClock,
  ): Result<void, AssignmentDueDateInPastError | InvalidAssignmentTransitionError> {
    if (this._status !== 'ACTIVE') {
      return Result.fail(
        new InvalidAssignmentTransitionError(
          `cannot update due date on assignment with status ${this._status}`,
        ),
      );
    }

    const dueDateResult = AssignmentDueDate.create(newDueAt, clock.now());
    if (dueDateResult.isFail) {
      return Result.fail(dueDateResult.error);
    }

    const previousDueAt = this._dueAt;
    this._dueAt = newDueAt;

    this.addDomainEvent(
      new AssignmentDueDateUpdatedEvent(this.id, {
        assignmentId: this.id,
        previousDueAt: previousDueAt.toISOString(),
        newDueAt: newDueAt.toISOString(),
      }),
    );

    return Result.ok();
  }

  updateNotes(notes: string | null): void {
    this._notes = notes;
  }

  get assignerId(): string { return this._assignerId; }
  get assigneeId(): string { return this._assigneeId; }
  get schoolId(): string | null { return this._schoolId; }
  get contentRef(): ContentRef { return this._contentRef; }
  get status(): AssignmentStatus { return this._status; }
  get assignedAt(): Date { return this._assignedAt; }
  get dueAt(): Date { return this._dueAt; }
  get completedAt(): Date | null { return this._completedAt; }
  get cancelledAt(): Date | null { return this._cancelledAt; }
  get cancelledReason(): string | null { return this._cancelledReason; }
  get notes(): string | null { return this._notes; }
  get deletedAt(): Date | null { return this._deletedAt; }
}
