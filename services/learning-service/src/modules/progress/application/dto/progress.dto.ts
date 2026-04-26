import type { UserProgress } from '../../domain/entities/user-progress.entity.js';

export interface ProgressDto {
  id: string;
  userId: string;
  contentRef: { type: string; id: string };
  status: string;
  attemptsCount: number;
  lastAttemptAt: string | null;
  timeSpentSeconds: number;
  score: number | null;
  completedAt: string | null;
  needsReviewSince: string | null;
  reviewResolvedAt: string | null;
}

export function toProgressDto(p: UserProgress): ProgressDto {
  return {
    id: p.id,
    userId: p.userId,
    contentRef: { type: p.contentRef.type, id: p.contentRef.id },
    status: p.status,
    attemptsCount: p.attemptsCount,
    lastAttemptAt: p.lastAttemptAt?.toISOString() ?? null,
    timeSpentSeconds: p.timeSpentSeconds,
    score: p.score,
    completedAt: p.completedAt?.toISOString() ?? null,
    needsReviewSince: p.needsReviewSince?.toISOString() ?? null,
    reviewResolvedAt: p.reviewResolvedAt?.toISOString() ?? null,
  };
}

export interface AssignmentProgressDto {
  assignmentId: string;
  assigneeId: string;
  contentRef: { type: string; id: string };
  progress: ProgressDto | null;
}
