import { Injectable, Logger } from '@nestjs/common';
import { ContentClient } from '../../infrastructure/http/content.client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

/** How long an outline is trusted before it is asked for again. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Keeps `course_outline_item` in step with the published course — plan 58, phase 1.
 *
 * Two ways in, because one is not enough on its own:
 *
 *   - `content.container.published` refreshes a course the moment it changes. This is the
 *     correct trigger and the only one that matters in production.
 *   - `ensureFresh()` fills a course in on first read. Events are not replayed into a
 *     service that was not listening, and on any environment restored from a dump — every
 *     development machine — the table would otherwise stay empty until somebody happened
 *     to republish a course. A group's progress screen would then show "no course items"
 *     for a course that plainly has them, which is exactly the kind of false emptiness
 *     this plan exists to prevent.
 *
 * A failed refresh keeps the rows already stored. Content being unreachable is not
 * evidence that a course has no units.
 */
@Injectable()
export class CourseOutlineService {
  private readonly logger = new Logger(CourseOutlineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentClient,
  ) {}

  /** Refresh if nothing is stored, or if what is stored is older than the window. */
  async ensureFresh(containerId: string): Promise<void> {
    const newest = await this.prisma.courseOutlineItem.findFirst({
      where: { containerId },
      orderBy: { refreshedAt: 'desc' },
      select: { refreshedAt: true },
    });

    if (newest && Date.now() - newest.refreshedAt.getTime() < STALE_AFTER_MS) return;
    await this.refresh(containerId);
  }

  async refresh(containerId: string): Promise<void> {
    const outline = await this.content.getCourseOutline(containerId);
    if (outline === null) return;

    // Published nothing: the course exists and has no teachable version. Stored rows are
    // cleared, because a group cannot be taught from a version that was withdrawn.
    if (outline.versionId === null) {
      await this.prisma.courseOutlineItem.deleteMany({ where: { containerId } });
      return;
    }

    const versionId = outline.versionId;
    const rows = outline.units.flatMap((unit) =>
      unit.items.map((item) => ({
        containerId,
        versionId,
        unitId: unit.id,
        unitOrder: unit.order,
        unitTitle: unit.title,
        itemId: item.id,
        itemType: item.itemType.toUpperCase(),
        position: item.position,
        refreshedAt: new Date(),
      })),
    );

    // Replaced whole, in one transaction: a unit's item count is a denominator, and a
    // half-written outline would divide by a number that never described any version.
    await this.prisma.$transaction([
      this.prisma.courseOutlineItem.deleteMany({ where: { containerId } }),
      ...(rows.length > 0
        ? [this.prisma.courseOutlineItem.createMany({ data: rows, skipDuplicates: true })]
        : []),
    ]);

    this.logger.log(
      `Outline refreshed for container ${containerId}: ${outline.units.length} unit(s), ${rows.length} item(s)`,
    );
  }
}
