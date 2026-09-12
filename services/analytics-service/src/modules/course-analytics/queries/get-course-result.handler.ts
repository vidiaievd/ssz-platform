import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { pct } from '@ssz/shared-kernel/analytics';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import { GetCourseResultQuery } from './get-course-result.query.js';
import type {
  CourseResultCellDto,
  CourseResultResponseDto,
} from '../dto/course-result-response.dto.js';

/**
 * Screen E's other half — what came out of a course, beside what the course contains.
 *
 * The coverage report already says what a course *trains*; this says what happened when
 * people tried it. Put side by side they answer the author's real question, which is not
 * "is my course balanced" but "is the part I wrote actually landing".
 *
 * Two rules shape the response. **No learner appears in it**, by name, by id, or by being
 * the only one in a cell — so each cell reports how many people stand behind it and the
 * screen can decline to draw a conclusion from one. And **`items` is not here** (§2 C):
 * the number of exercises is the coverage report's, loaded on the same screen, and a
 * second source for it would disagree with the first after any publish.
 */
@QueryHandler(GetCourseResultQuery)
@Injectable()
export class GetCourseResultHandler
  implements IQueryHandler<GetCourseResultQuery, CourseResultResponseDto>
{
  private readonly minWeightedSample: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig>,
  ) {
    this.minWeightedSample = config.get<AppConfig['mastery']>('mastery')?.minWeightedSample ?? 8;
  }

  async execute(query: GetCourseResultQuery): Promise<CourseResultResponseDto> {
    const { containerId, viewerUserId } = query;

    // ── Who may read a course's results ─────────────────────────────────────
    //
    // Its owner, or somebody in the school that owns it. A course shared into another
    // school is not covered: sharing lives in content-service and analytics has no
    // projection of it, so the endpoint is narrower than the screen here rather than
    // wider — the opposite direction from §2 F, and the safe one for an answer that
    // aggregates other people's learners.
    const container = await this.prisma.containerDirectory.findUnique({ where: { containerId } });
    if (!container || container.deletedAt !== null) throw new NotFoundException('Course not found');

    if (container.ownerUserId !== viewerUserId) {
      const schoolId = container.ownerSchoolId;
      const member =
        schoolId === null
          ? null
          : await this.prisma.schoolMembership.findUnique({
              where: { schoolId_userId: { schoolId, userId: viewerUserId } },
            });
      if (!member) throw new NotFoundException('Course not found');
    }

    // ── What the profiles say about this course ─────────────────────────────
    //
    // Read off `skill_mastery`, whose rows are (learner × course × skill × focus) — the
    // course axis this screen needs is already there, and the number is the same EWMA a
    // learner sees on their own grid. Counting a fresh rate off the attempts instead
    // would put a different number for the same cell on two screens one click apart.
    const rows = await this.prisma.skillMastery.findMany({
      where: { userId: { not: undefined }, courseId: containerId },
      select: {
        userId: true,
        skill: true,
        focus: true,
        successRateEwma: true,
        attempts: true,
        weightedSample: true,
      },
    });

    const cells = new Map<string, Cell>();
    const learners = new Set<string>();

    for (const row of rows) {
      if (row.attempts === 0) continue;
      learners.add(row.userId);

      const key = `${row.skill}:${row.focus}`;
      const cell = cells.get(key) ?? {
        skill: row.skill,
        focus: row.focus,
        attempts: 0,
        weightedSample: 0,
        weightedRate: 0,
        learners: new Set<string>(),
      };

      cell.attempts += row.attempts;
      cell.weightedSample += row.weightedSample;
      // Weighted by evidence, not by head: a learner who did forty exercises should count
      // for more of the course's verdict than one who tried two, exactly as within a
      // single profile.
      cell.weightedRate += row.successRateEwma * row.weightedSample;
      cell.learners.add(row.userId);
      cells.set(key, cell);
    }

    // The group count comes from the attempts rather than the profiles: `skill_mastery`
    // has no group axis at all. Rows older than the column carry no group and are simply
    // not counted — an undercount that says "we do not know", never a zero standing in
    // for "nobody".
    const groups = await this.prisma.attemptEvidence.findMany({
      where: { containerId, groupId: { not: null } },
      distinct: ['groupId'],
      select: { groupId: true },
    });

    return {
      containerId,
      minWeightedSample: this.minWeightedSample,
      learners: learners.size,
      groups: groups.length,
      cells: [...cells.values()]
        .map(
          (cell): CourseResultCellDto => ({
            skill: cell.skill,
            focus: cell.focus,
            attempts: cell.attempts,
            ewma: cell.weightedSample > 0 ? pct(cell.weightedRate / cell.weightedSample) : null,
            learners: cell.learners.size,
            weightedSample: Math.round(cell.weightedSample * 100) / 100,
          }),
        )
        .sort((a, b) => a.skill.localeCompare(b.skill) || a.focus.localeCompare(b.focus)),
    };
  }
}

interface Cell {
  skill: string;
  focus: string;
  attempts: number;
  weightedSample: number;
  weightedRate: number;
  learners: Set<string>;
}
