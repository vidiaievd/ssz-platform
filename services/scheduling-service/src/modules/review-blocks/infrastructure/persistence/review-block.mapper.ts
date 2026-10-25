import type {
  ReviewBlock as PrismaReviewBlock,
  ReviewBlockSkip as PrismaReviewBlockSkip,
} from '../../../../../generated/prisma/client.js';
import { ReviewBlock, dayKey, type ReviewBlockRepeat } from '../../domain/entities/review-block.entity.js';

export type ReviewBlockRow = PrismaReviewBlock & { skips: PrismaReviewBlockSkip[] };

export class ReviewBlockMapper {
  static toDomain(row: ReviewBlockRow): ReviewBlock {
    return new ReviewBlock(
      row.id,
      row.schoolId,
      row.teacherId,
      row.repeat as ReviewBlockRepeat,
      row.startsOn,
      row.endsOn,
      row.startTime,
      row.endTime,
      row.note,
      row.createdBy,
      row.createdAt,
      row.updatedAt,
      new Set(row.skips.map((s) => dayKey(s.date))),
    );
  }
}
