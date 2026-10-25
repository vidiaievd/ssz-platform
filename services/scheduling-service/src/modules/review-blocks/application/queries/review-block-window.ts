import type { ReviewBlock, ReviewBlockOccurrence } from '../../domain/entities/review-block.entity.js';
import {
  findReviewBlockOverlaps,
  type ReviewBlockOverlap,
  type TimedLesson,
} from '../../domain/services/review-block-overlaps.js';

/**
 * Blocks as rules, for editing; their sittings in the window, for drawing; and where
 * a sitting runs into a lesson or another block, so the calendar can say so.
 */
export interface ReviewBlockWindow {
  blocks: ReviewBlock[];
  occurrences: ReviewBlockOccurrence[];
  overlaps: ReviewBlockOverlap[];
}

export function toWindow(
  blocks: ReviewBlock[],
  from: Date,
  to: Date,
  lessons: TimedLesson[],
): ReviewBlockWindow {
  const occurrences = blocks
    .flatMap((b) => b.occurrencesBetween(from, to))
    .sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        a.startTime.localeCompare(b.startTime) ||
        a.teacherId.localeCompare(b.teacherId),
    );
  // A series whose every sitting in the window is skipped is still listed: the rule
  // is what a teacher edits, whether or not this week shows it.
  return { blocks, occurrences, overlaps: findReviewBlockOverlaps(occurrences, lessons) };
}
