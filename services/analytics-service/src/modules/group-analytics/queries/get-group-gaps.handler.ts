import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { pct } from '@ssz/shared-kernel/analytics';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import {
  GroupUnitsService,
  absorbedDistribution,
  absorbedOverall,
  unitDeliveryOf,
  type CourseUnit,
  type GroupDeliveryView,
} from '../group-units.service.js';
import { GetGroupGapsQuery } from './get-group-gaps.query.js';
import type { GroupGapDto, GroupGapsResponseDto } from '../dto/group-gaps-response.dto.js';

/**
 * Screen D — which group of this school is furthest from what it was taught (plan 58,
 * phase 10).
 *
 * Thin over phase 2 on purpose: the row's two numbers are the same `delivered` and
 * `absorbed` the group's own Progress tab prints, read through the same service, so that
 * a teacher who clicks a row does not land on a screen that disagrees with the widget
 * that sent them.
 *
 * The rule the whole package is built on holds here too: a group with no course and a
 * group nobody has attempted anything in are named as such rather than shown at zero, and
 * the widget puts them under their own heading instead of sorting them to the bottom
 * (DECISIONS §O7).
 */
@QueryHandler(GetGroupGapsQuery)
@Injectable()
export class GetGroupGapsHandler implements IQueryHandler<GetGroupGapsQuery, GroupGapsResponseDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: GroupUnitsService,
  ) {}

  async execute(query: GetGroupGapsQuery): Promise<GroupGapsResponseDto> {
    const { schoolId, viewerUserId } = query;

    // Membership of the school, exactly as the group's own screen asks it: this widget
    // shows nothing a member could not open one row at a time.
    const viewer = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: viewerUserId } },
    });
    if (!viewer) throw new NotFoundException('School not found');

    const groups = await this.prisma.groupDirectory.findMany({
      where: { schoolId, status: 'active' },
      orderBy: { name: 'asc' },
    });
    if (groups.length === 0) {
      return { groups: [], updatedAt: new Date().toISOString() };
    }

    const rosters = await this.prisma.groupMembership.findMany({
      where: { groupId: { in: groups.map((group) => group.groupId) } },
      select: { groupId: true, userId: true },
    });
    const byGroup = new Map<string, string[]>();
    for (const row of rosters) {
      const list = byGroup.get(row.groupId) ?? [];
      list.push(row.userId);
      byGroup.set(row.groupId, list);
    }

    const courseIds = [...new Set(groups.map((g) => g.courseId).filter((id): id is string => id !== null))];
    const containers = await this.prisma.containerDirectory.findMany({
      where: { containerId: { in: courseIds } },
      select: { containerId: true, title: true },
    });
    const titles = new Map(containers.map((container) => [container.containerId, container.title]));

    const rows = await Promise.all(
      groups.map((group) =>
        this.rowOf({
          groupId: group.groupId,
          name: group.name,
          courseId: group.courseId,
          courseTitle: group.courseId === null ? null : (titles.get(group.courseId) ?? null),
          userIds: byGroup.get(group.groupId) ?? [],
        }),
      ),
    );

    const updatedAt = groups
      .map((group) => group.updatedAt)
      .reduce((latest, date) => (date > latest ? date : latest));

    return { groups: rows, updatedAt: updatedAt.toISOString() };
  }

  private async rowOf(input: {
    groupId: string;
    name: string;
    courseId: string | null;
    courseTitle: string | null;
    userIds: string[];
  }): Promise<GroupGapDto> {
    const { groupId, name, courseId, courseTitle, userIds } = input;
    const base = { groupId, name, courseId, courseTitle, students: userIds.length };

    // Nothing to compare against: a group with no course is not a group doing badly, and
    // asking the timetable and the item states about it would answer zeroes.
    if (courseId === null) {
      return { ...base, delivered: null, absorbed: null, state: 'noCourse' };
    }

    const [delivery, courseUnits] = await Promise.all([
      this.units.deliveryOf(groupId),
      this.units.unitsOf(courseId),
    ]);
    const absorbed = await this.units.absorbedByUnit(userIds, courseUnits);

    const distribution = absorbedDistribution(
      absorbedOverall({ userIds, units: courseUnits, absorbed, delivery }),
    );

    return {
      ...base,
      delivered: deliveredShareOf(delivery, courseUnits),
      absorbed: distribution === null ? null : (pct(distribution.median) as number),
      state: distribution === null ? 'noAttempts' : 'ok',
    };
  }
}

/**
 * How much of the course this group has been taught, as one number.
 *
 * A half-taught unit counts as half, the way the chart draws it. `null` means the
 * timetable could not be asked at all — the widget then says so rather than printing a
 * group that was taught nothing (plan 58 §2, deviation 1).
 */
function deliveredShareOf(
  delivery: GroupDeliveryView | null,
  courseUnits: readonly CourseUnit[],
): number | null {
  if (delivery === null) return null;
  if (courseUnits.length === 0) return null;

  const taught = courseUnits.reduce(
    (sum, unit) => sum + unitDeliveryOf(delivery, unit.unitId).value,
    0,
  );
  return pct(taught / courseUnits.length) as number;
}
