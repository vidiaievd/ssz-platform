import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { CourseOutlineService } from '../projections/course-outline.service.js';

/** One course: how many items its published version holds, and how many each learner passed. */
export interface CourseCompletion {
  items: number;
  passedBy: Map<string, number>;
}

/** `passed / items` rounded to hundredths; 0 for a course with no items known. */
export function completionRatio(passed: number, items: number): number {
  if (items <= 0) return 0;
  return Math.round((Math.min(passed, items) / items) * 100) / 100;
}

/**
 * How far learners are through the courses they are enrolled in — the school dashboard's
 * course health and at-risk widgets (OQ-106).
 *
 * The denominator is the published version's items (`course_outline_item`, plan 58), the
 * numerator the learner's `COMPLETED` rows in `item_progress` on those very items. These
 * widgets used to divide by `container_directory.leaf_item_count`, which nothing ever filled
 * in (always 0, so every ratio was 0), over completions of anything the learner had done
 * in any course.
 *
 * A course whose outline could not be read has `items: 0` — unknown, not empty.
 */
@Injectable()
export class CourseCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outline: CourseOutlineService,
  ) {}

  async completionOf(
    containerIds: readonly string[],
    userIds: readonly string[],
  ): Promise<Map<string, CourseCompletion>> {
    const result = new Map<string, CourseCompletion>();
    for (const id of containerIds) result.set(id, { items: 0, passedBy: new Map() });
    if (containerIds.length === 0) return result;

    // A course first read here gets its outline now; the published event keeps it current.
    await Promise.all(containerIds.map((id) => this.outline.ensureFresh(id)));

    const outlineRows = await this.prisma.courseOutlineItem.findMany({
      where: { containerId: { in: [...containerIds] } },
      select: { containerId: true, itemId: true },
    });

    // One lesson can sit in two courses: its completion counts towards both.
    const coursesOfItem = new Map<string, string[]>();
    for (const row of outlineRows) {
      const course = result.get(row.containerId);
      if (course === undefined) continue;
      course.items += 1;
      const courses = coursesOfItem.get(row.itemId) ?? [];
      courses.push(row.containerId);
      coursesOfItem.set(row.itemId, courses);
    }
    if (userIds.length === 0 || coursesOfItem.size === 0) return result;

    const passed = await this.prisma.itemProgress.findMany({
      where: {
        userId: { in: [...userIds] },
        contentId: { in: [...coursesOfItem.keys()] },
        // NEEDS_REVIEW is with a teacher, not taken away yet — as in the group screens.
        status: 'COMPLETED',
      },
      select: { userId: true, contentId: true },
    });

    for (const row of passed) {
      for (const containerId of coursesOfItem.get(row.contentId) ?? []) {
        const byLearner = result.get(containerId)!.passedBy;
        byLearner.set(row.userId, (byLearner.get(row.userId) ?? 0) + 1);
      }
    }
    return result;
  }
}
