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
        userId: this._userId,
        containerId: this._containerId,
        schoolId: this._schoolId,
        completedAt: now,
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
