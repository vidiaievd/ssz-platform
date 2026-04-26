import { Submission, type SubmissionStatus } from '../../domain/entities/submission.entity.js';
import {
  SubmissionRevision,
  type RevisionDecision,
  type SubmissionContent,
} from '../../domain/entities/submission-revision.entity.js';

type PrismaRevisionModel = {
  id: string;
  submissionId: string;
  revisionNumber: number;
  content: unknown;
  submittedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  feedback: string | null;
  score: number | null;
  decision: string | null;
};

type PrismaSubmissionModel = {
  id: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  schoolId: string | null;
  status: string;
  currentRevisionNumber: number;
  submittedAt: Date;
  deletedAt: Date | null;
  revisions?: PrismaRevisionModel[];
};

export class SubmissionMapper {
  static toDomain(row: PrismaSubmissionModel): Submission {
    const revisions = (row.revisions ?? []).map(SubmissionMapper.revisionToDomain);
    return Submission.reconstitute({
      id: row.id,
      userId: row.userId,
      exerciseId: row.exerciseId,
      assignmentId: row.assignmentId,
      schoolId: row.schoolId,
      status: row.status as SubmissionStatus,
      currentRevisionNumber: row.currentRevisionNumber,
      submittedAt: row.submittedAt,
      deletedAt: row.deletedAt,
      revisions,
    });
  }

  static revisionToDomain(row: PrismaRevisionModel): SubmissionRevision {
    return new SubmissionRevision({
      id: row.id,
      submissionId: row.submissionId,
      revisionNumber: row.revisionNumber,
      content: row.content as SubmissionContent,
      submittedAt: row.submittedAt,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      feedback: row.feedback,
      score: row.score,
      decision: row.decision as RevisionDecision | null,
    });
  }

  static toPersistence(s: Submission) {
    return {
      id: s.id,
      userId: s.userId,
      exerciseId: s.exerciseId,
      assignmentId: s.assignmentId,
      schoolId: s.schoolId,
      status: s.status,
      currentRevisionNumber: s.currentRevisionNumber,
      submittedAt: s.submittedAt,
      deletedAt: s.deletedAt,
    };
  }

  static revisionToPersistence(rev: SubmissionRevision) {
    return {
      id: rev.id,
      submissionId: rev.submissionId,
      revisionNumber: rev.revisionNumber,
      content: rev.content,
      submittedAt: rev.submittedAt,
      reviewedBy: rev.reviewedBy,
      reviewedAt: rev.reviewedAt,
      feedback: rev.feedback,
      score: rev.score,
      decision: rev.decision,
    };
  }
}
