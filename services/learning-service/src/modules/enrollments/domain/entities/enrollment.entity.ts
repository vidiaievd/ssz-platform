import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import {
  EnrollmentAlreadyCompletedError,
  EnrollmentAlreadyUnenrolledError,
  InvalidEnrollmentTransitionError,
  type EnrollmentDomainError,
} from '../exceptions/enrollment.errors.js';
import { EnrollmentCreatedEvent } from '../events/enrollment-created.event.js';
import { EnrollmentCompletedEvent } from '../events/enrollment-completed.event.js';
import { EnrollmentUnenrolledEvent } from '../events/enrollment-unenrolled.event.js';

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'UNENROLLED';

export interface CreateEnrollmentProps {
  userId: string;
  containerId: string;
  schoolId?: string | null;
}

export interface EnrollmentPersistenceProps {
  id: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
  status: EnrollmentStatus;
  enrolledAt: Date;
  completedAt: Date | null;
  unenrolledAt: Date | null;
  unenrollReason: string | null;
  deletedAt: Date | null;
}

export class Enrollment extends AggregateRoot {
  private constructor(
    id: string,
    private _userId: string,
    private _containerId: string,
    private _schoolId: string | null,
    private _status: EnrollmentStatus,
    private _enrolledAt: Date,
    private _completedAt: Date | null,
    private _unenrolledAt: Date | null,
    private _unenrollReason: string | null,
    private _deletedAt: Date | null,
  ) {
    super(id);
  }

  static create(props: CreateEnrollmentProps, now: Date): Enrollment {
    const enrollment = new Enrollment(
      randomUUID(),
      props.userId,
      props.containerId,
      props.schoolId ?? null,
      'ACTIVE',
      now,
      null,
      null,
      null,
      null,
    );

    enrollment.addDomainEvent(
      new EnrollmentCreatedEvent(enrollment.id, {
        enrollmentId: enrollment.id,
        userId: enrollment._userId,
        containerId: enrollment._containerId,
        schoolId: enrollment._schoolId,
      }),
    );

    return enrollment;
  }

  static reconstitute(props: EnrollmentPersistenceProps): Enrollment {
    return new Enrollment(
      props.id,
      props.userId,
      props.containerId,
      props.schoolId,
      props.status,
      props.enrolledAt,
      props.completedAt,
      props.unenrolledAt,
      props.unenrollReason,
      props.deletedAt,
    );
  }

  complete(now: Date): Result<void, EnrollmentDomainError> {
    if (this._status === 'COMPLETED') {
      return Result.fail(new EnrollmentAlreadyCompletedError());
    }
    if (this._status === 'UNENROLLED') {
      return Result.fail(new InvalidEnrollmentTransitionError('UNENROLLED', 'COMPLETED'));
    }

    this._status = 'COMPLETED';
    this._completedAt = now;

    this.addDomainEvent(
      new EnrollmentCompletedEvent(this.id, {
        enrollmentId: this.id,
        userId: this._userId,
        containerId: this._containerId,
        schoolId: this._schoolId,
        completedAt: now.toISOString(),
      }),
    );

    return Result.ok();
  }

  /**
   * Come back to a course this learner had left.
   *
   * The same row is brought back to life rather than a second one created: `(userId,
   * containerId)` is unique, and the old code built a fresh aggregate for a learner who
   * already had a row — which reached the database as a constraint violation and left the
   * caller with a 500 for a perfectly ordinary act. Only an UNENROLLED enrollment can be
   * revived; a COMPLETED one is not in the way, and clearing a completion to "start again"
   * would erase something the learner earned.
   *
   * The creation event is raised again on purpose: downstream projections flip a learner
   * back to ACTIVE on it, and they are keyed by the enrollment id — the same id they were
   * told about the first time.
   */
  reenrol(now: Date, schoolId?: string | null): Result<void, EnrollmentDomainError> {
    if (this._status !== 'UNENROLLED') {
      return Result.fail(new InvalidEnrollmentTransitionError(this._status, 'ACTIVE'));
    }

    this._status = 'ACTIVE';
    this._enrolledAt = now;
    this._unenrolledAt = null;
    this._unenrollReason = null;
    if (schoolId !== undefined) this._schoolId = schoolId;

    this.addDomainEvent(
      new EnrollmentCreatedEvent(this.id, {
        enrollmentId: this.id,
        userId: this._userId,
        containerId: this._containerId,
        schoolId: this._schoolId,
      }),
    );

    return Result.ok();
  }

  unenroll(reason?: string): Result<void, EnrollmentDomainError> {
    if (this._status === 'UNENROLLED') {
      return Result.fail(new EnrollmentAlreadyUnenrolledError());
    }
    if (this._status === 'COMPLETED') {
      return Result.fail(new InvalidEnrollmentTransitionError('COMPLETED', 'UNENROLLED'));
    }

    this._status = 'UNENROLLED';
    this._unenrolledAt = new Date();
    this._unenrollReason = reason ?? null;

    this.addDomainEvent(
      new EnrollmentUnenrolledEvent(this.id, {
        enrollmentId: this.id,
        userId: this._userId,
        containerId: this._containerId,
        reason: this._unenrollReason,
      }),
    );

    return Result.ok();
  }

  get userId(): string { return this._userId; }
  get containerId(): string { return this._containerId; }
  get schoolId(): string | null { return this._schoolId; }
  get status(): EnrollmentStatus { return this._status; }
  get enrolledAt(): Date { return this._enrolledAt; }
  get completedAt(): Date | null { return this._completedAt; }
  get unenrolledAt(): Date | null { return this._unenrolledAt; }
  get unenrollReason(): string | null { return this._unenrollReason; }
  get deletedAt(): Date | null { return this._deletedAt; }
}
