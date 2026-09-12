import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { pct } from '@ssz/shared-kernel/analytics';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import { GroupUnitsService, learnerCellOf, unitDeliveryOf } from '../group-units.service.js';
import { GetGroupHeatmapQuery } from './get-group-heatmap.query.js';
import type { GroupHeatmapResponseDto, HeatmapRowDto } from '../dto/group-heatmap-response.dto.js';

/**
 * Screen B — the panel under the group's chart: every learner against every unit.
 *
 * It exists because the median above it hides the person who is drowning, so the one
 * thing it must never do is hide them a second way: a learner nobody has data for gets a
 * row of named emptinesses, not a row of zeroes. Every cell here is computed by
 * `learnerCellOf`, the same helper the chart's `notJudgeable` counter reads, so the two
 * halves of one screen cannot disagree about the same learner's same unit.
 */
@QueryHandler(GetGroupHeatmapQuery)
@Injectable()
export class GetGroupHeatmapHandler
  implements IQueryHandler<GetGroupHeatmapQuery, GroupHeatmapResponseDto>
{
  private readonly minWeightedSample: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly units: GroupUnitsService,
    config: ConfigService<AppConfig>,
  ) {
    this.minWeightedSample = config.get<AppConfig['mastery']>('mastery')?.minWeightedSample ?? 8;
  }

  async execute(query: GetGroupHeatmapQuery): Promise<GroupHeatmapResponseDto> {
    const { groupId, viewerUserId } = query;

    // Membership of the group's school, as on the chart: which teacher may open which
    // group is settled where the teacher roster is already loaded (plan 58 §2 F). This
    // route carries personal rows, and that softness is the risk written in §4.
    const group = await this.prisma.groupDirectory.findUnique({ where: { groupId } });
    if (!group) throw new NotFoundException('Group not found');

    const viewer = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId: group.schoolId, userId: viewerUserId } },
    });
    if (!viewer) throw new NotFoundException('Group not found');

    const roster = await this.prisma.groupMembership.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const userIds = roster.map((row) => row.userId);

    const courseId = group.courseId;
    const courseUnits = courseId === null ? [] : await this.units.unitsOf(courseId);

    const [delivery, absorbed, evidence, names, lastActivity] = await Promise.all([
      this.units.deliveryOf(groupId),
      this.units.absorbedByUnit(userIds, courseUnits),
      this.units.evidenceByUnit(userIds, courseUnits),
      this.namesOf(userIds),
      this.lastActivityOf(userIds, courseId),
    ]);

    const deliveredByUnit = courseUnits.map((unit) =>
      delivery === null ? null : unitDeliveryOf(delivery, unit.unitId),
    );

    const rows: HeatmapRowDto[] = userIds.map((userId) => ({
      studentId: userId,
      // A learner the directory has not heard of still gets a row — leaving them out
      // would quietly shrink the group, which is the same lie as a zero.
      displayName: names.get(userId) ?? 'Unknown student',
      lastActivityAt: lastActivity.get(userId)?.toISOString() ?? null,
      cells: courseUnits.map((unit, index) => {
        const cell = learnerCellOf({
          unit,
          absorbed: absorbed.get(unit.unitId)?.get(userId),
          evidence: evidence.get(unit.unitId)?.byLearner.get(userId),
          delivered: deliveredByUnit[index] ?? null,
          minWeightedSample: this.minWeightedSample,
        });

        return {
          state: cell.state,
          // Rounded once, here, on the way out — §O9.
          value: pct(cell.value),
          weightedSample: Math.round(cell.weightedSample * 100) / 100,
        };
      }),
    }));

    const newestActivity = [...lastActivity.values()].reduce<Date | null>(
      (latest, date) => (latest === null || date > latest ? date : latest),
      null,
    );

    return {
      groupId,
      courseId,
      updatedAt: (newestActivity !== null && newestActivity > group.updatedAt
        ? newestActivity
        : group.updatedAt
      ).toISOString(),
      minWeightedSample: this.minWeightedSample,
      deliveryUnavailable: delivery === null,
      units: courseUnits.map((unit) => ({ unitId: unit.unitId, no: unit.no, title: unit.title })),
      rows,
    };
  }

  private async namesOf(userIds: readonly string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.userDirectory.findMany({
      where: { userId: { in: [...userIds] } },
      select: { userId: true, displayName: true },
    });
    return new Map(rows.map((row) => [row.userId, row.displayName]));
  }

  /**
   * When each learner was last seen on this course — attempts and item states alike.
   *
   * The column is what a teacher reads a row of `notStarted` against: gone quiet in July
   * and joined last week are the same row of empty cells and very different problems.
   */
  private async lastActivityOf(
    userIds: readonly string[],
    courseId: string | null,
  ): Promise<Map<string, Date>> {
    const seen = new Map<string, Date>();
    if (userIds.length === 0) return seen;

    const [attempts, items] = await Promise.all([
      this.prisma.attemptEvidence.findMany({
        where: { userId: { in: [...userIds] }, ...(courseId !== null && { containerId: courseId }) },
        orderBy: { occurredAt: 'desc' },
        select: { userId: true, occurredAt: true },
      }),
      this.prisma.itemProgress.findMany({
        where: { userId: { in: [...userIds] } },
        orderBy: { updatedAt: 'desc' },
        select: { userId: true, updatedAt: true },
      }),
    ]);

    for (const row of attempts) if (!seen.has(row.userId)) seen.set(row.userId, row.occurredAt);
    for (const row of items) {
      const known = seen.get(row.userId);
      if (known === undefined || row.updatedAt > known) seen.set(row.userId, row.updatedAt);
    }

    return seen;
  }
}
