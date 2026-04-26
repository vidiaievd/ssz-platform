import type { Submission } from '../../domain/entities/submission.entity.js';
import type { SubmissionRevision } from '../../domain/entities/submission-revision.entity.js';

export interface SubmissionRevisionDto {
  id: string;
  revisionNumber: number;
  content: { text?: string; mediaRefs?: string[] };
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  feedback: string | null;
  score: number | null;
  decision: string | null;
}

export interface SubmissionDto {
  id: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  schoolId: string | null;
  status: string;
  currentRevisionNumber: number;
  submittedAt: string;
  revisions: SubmissionRevisionDto[];
}

export function toRevisionDto(rev: SubmissionRevision): SubmissionRevisionDto {
  return {
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    content: rev.content,
    submittedAt: rev.submittedAt.toISOString(),
    reviewedBy: rev.reviewedBy,
    reviewedAt: rev.reviewedAt?.toISOString() ?? null,
    feedback: rev.feedback,
    score: rev.score,
    decision: rev.decision,
  };
}

export function toSubmissionDto(s: Submission): SubmissionDto {
  return {
    id: s.id,
    userId: s.userId,
    exerciseId: s.exerciseId,
    assignmentId: s.assignmentId,
    schoolId: s.schoolId,
    status: s.status,
    currentRevisionNumber: s.currentRevisionNumber,
    submittedAt: s.submittedAt.toISOString(),
    revisions: s.revisions.map(toRevisionDto),
  };
}
