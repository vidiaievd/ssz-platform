import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import {
  SubmissionCannotBeResubmittedError,
  SubmissionCannotBeReviewedError,
  type SubmissionDomainError,
} from '../exceptions/submission.errors.js';
import {
  SubmissionRevision,
  type SubmissionContent,
  type RevisionDecision,
} from './submission-revision.entity.js';
import { SubmissionCreatedEvent } from '../events/submission-created.event.js';
import { SubmissionResubmittedEvent } from '../events/submission-resubmitted.event.js';
import { SubmissionReviewedEvent } from '../events/submission-reviewed.event.js';

export type SubmissionStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED'
  | 'RESUBMITTED';

export interface SubmitProps {
  userId: string;
  exerciseId: string;
  content: SubmissionContent;
  assignmentId?: string;
  schoolId?: string;
}

export interface SubmissionPersistenceProps {
  id: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  schoolId: string | null;
  status: SubmissionStatus;
  currentRevisionNumber: number;
  submittedAt: Date;
  deletedAt: Date | null;
  revisions: SubmissionRevision[];
}

export class Submission extends AggregateRoot {
  private constructor(
    id: string,
    private _userId: string,
    private _exerciseId: string,
    private _assignmentId: string | null,
    private _schoolId: string | null,
    private _status: SubmissionStatus,
    private _currentRevisionNumber: number,
    private _submittedAt: Date,
    private _deletedAt: Date | null,
    private _revisions: SubmissionRevision[],
  ) {
    super(id);
  }

  static submit(props: SubmitProps, now: Date): Submission {
    const id = randomUUID();
    const revision = new SubmissionRevision({
      id: randomUUID(),
      submissionId: id,
      revisionNumber: 1,
      content: props.content,
      submittedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      feedback: null,
      score: null,
      decision: null,
    });

    const submission = new Submission(
      id,
      props.userId,
      props.exerciseId,
      props.assignmentId ?? null,
      props.schoolId ?? null,
      'PENDING_REVIEW',
      1,
      now,
      null,
      [revision],
    );

    submission.addDomainEvent(
      new SubmissionCreatedEvent(id, {
        submissionId: id,
        userId: props.userId,
        exerciseId: props.exerciseId,
        assignmentId: props.assignmentId ?? null,
        schoolId: props.schoolId ?? null,
      }),
    );

    return submission;
  }

  static reconstitute(props: SubmissionPersistenceProps): Submission {
    return new Submission(
      props.id,
      props.userId,
      props.exerciseId,
      props.assignmentId,
      props.schoolId,
      props.status,
      props.currentRevisionNumber,
      props.submittedAt,
      props.deletedAt,
      props.revisions,
    );
  }

  resubmit(content: SubmissionContent, now: Date): Result<void, SubmissionDomainError> {
    if (this._status !== 'REVISION_REQUESTED') {
      return Result.fail(new SubmissionCannotBeResubmittedError(this._status));
    }

    const newNumber = this._currentRevisionNumber + 1;
    this._revisions.push(
      new SubmissionRevision({
        id: randomUUID(),
        submissionId: this.id,
        revisionNumber: newNumber,
        content,
        submittedAt: now,
        reviewedBy: null,
        reviewedAt: null,
        feedback: null,
        score: null,
        decision: null,
      }),
    );
    this._currentRevisionNumber = newNumber;
    this._status = 'RESUBMITTED';

    this.addDomainEvent(
      new SubmissionResubmittedEvent(this.id, {
        submissionId: this.id,
        userId: this._userId,
        exerciseId: this._exerciseId,
        revisionNumber: newNumber,
      }),
    );

    return Result.ok();
  }

  review(
    reviewerId: string,
    decision: RevisionDecision,
    feedback: string | null,
    score: number | null,
    now: Date,
  ): Result<void, SubmissionDomainError> {
    if (this._status !== 'PENDING_REVIEW' && this._status !== 'RESUBMITTED') {
      return Result.fail(new SubmissionCannotBeReviewedError(this._status));
    }

    const current = this._revisions[this._revisions.length - 1];
    current.reviewedBy = reviewerId;
    current.reviewedAt = now;
    current.feedback = feedback;
    current.score = score;
    current.decision = decision;

    this._status =
      decision === 'APPROVED' ? 'APPROVED'
      : decision === 'REJECTED' ? 'REJECTED'
      : 'REVISION_REQUESTED';

    this.addDomainEvent(
      new SubmissionReviewedEvent(this.id, {
        submissionId: this.id,
        userId: this._userId,
        exerciseId: this._exerciseId,
        assignmentId: this._assignmentId,
        reviewerId,
        decision,
        feedback,
        score,
      }),
    );

    return Result.ok();
  }

  get userId(): string { return this._userId; }
  get exerciseId(): string { return this._exerciseId; }
  get assignmentId(): string | null { return this._assignmentId; }
  get schoolId(): string | null { return this._schoolId; }
  get status(): SubmissionStatus { return this._status; }
  get currentRevisionNumber(): number { return this._currentRevisionNumber; }
  get submittedAt(): Date { return this._submittedAt; }
  get deletedAt(): Date | null { return this._deletedAt; }
  get revisions(): SubmissionRevision[] { return [...this._revisions]; }
}
