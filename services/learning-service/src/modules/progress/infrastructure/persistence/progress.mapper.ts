import { UserProgress, type ProgressStatus } from '../../domain/entities/user-progress.entity.js';

type PrismaProgressModel = {
  id: string;
  userId: string;
  contentType: string;
  contentId: string;
  status: string;
  attemptsCount: number;
  lastAttemptAt: Date | null;
  timeSpentSeconds: number;
  score: number | null;
  completedAt: Date | null;
  needsReviewSince: Date | null;
  reviewResolvedAt: Date | null;
};

export class ProgressMapper {
  static toDomain(row: PrismaProgressModel): UserProgress {
    return UserProgress.reconstitute({
      id: row.id,
      userId: row.userId,
      contentType: row.contentType,
      contentId: row.contentId,
      status: row.status as ProgressStatus,
      attemptsCount: row.attemptsCount,
      lastAttemptAt: row.lastAttemptAt,
      timeSpentSeconds: row.timeSpentSeconds,
      score: row.score,
      completedAt: row.completedAt,
      needsReviewSince: row.needsReviewSince,
      reviewResolvedAt: row.reviewResolvedAt,
    });
  }

  static toPersistence(p: UserProgress) {
    return {
      id: p.id,
      userId: p.userId,
      contentType: p.contentRef.type,
      contentId: p.contentRef.id,
      status: p.status,
      attemptsCount: p.attemptsCount,
      lastAttemptAt: p.lastAttemptAt,
      timeSpentSeconds: p.timeSpentSeconds,
      score: p.score,
      completedAt: p.completedAt,
      needsReviewSince: p.needsReviewSince,
      reviewResolvedAt: p.reviewResolvedAt,
    };
  }
}
