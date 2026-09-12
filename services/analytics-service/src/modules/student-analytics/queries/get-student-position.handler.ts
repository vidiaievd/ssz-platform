import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { bandOf, pct, percentileOf } from '@ssz/shared-kernel/analytics';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import {
  GroupUnitsService,
  absorbedDistribution,
  absorbedOverall,
} from '../../group-analytics/group-units.service.js';
import { StudentAccessService } from '../student-access.service.js';
import { GetStudentPositionQuery } from './student-analytics.queries.js';
import type { StudentPositionResponseDto } from '../dto/student-analytics-response.dto.js';

/**
 * "Against the group" — one line, and `null` rather than a line whenever there is nothing
 * to say.
 *
 * Both numbers come out of `absorbedOverall`, the same function the group's chart takes
 * its median from: the learner is told where they stand against exactly the line their
 * teacher is looking at. The answer carries a count of classmates and never a name — the
 * learner's own screen shows only the band (§3.6), and even the teacher's version has no
 * business naming who is below whom.
 *
 * `null` is a real answer here, and the common one: a group where nobody has been
 * measured has no median, and inventing `0%` for it would tell a learner they are at the
 * bottom of a ranking that does not exist.
 */
@QueryHandler(GetStudentPositionQuery)
@Injectable()
export class GetStudentPositionHandler
  implements IQueryHandler<GetStudentPositionQuery, StudentPositionResponseDto | null>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StudentAccessService,
    private readonly units: GroupUnitsService,
  ) {}

  async execute(query: GetStudentPositionQuery): Promise<StudentPositionResponseDto | null> {
    const { studentId, viewerUserId, groupId } = query;
    await this.access.assertMayRead(studentId, viewerUserId);

    const group = await this.prisma.groupDirectory.findUnique({ where: { groupId } });
    if (!group) throw new NotFoundException('Group not found');

    const member = await this.prisma.groupMembership.findFirst({
      where: { groupId, userId: studentId },
      select: { userId: true },
    });
    if (!member) throw new NotFoundException('Student is not in this group');

    if (group.courseId === null) return null;

    const roster = await this.prisma.groupMembership.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const userIds = roster.map((row) => row.userId);

    const courseUnits = await this.units.unitsOf(group.courseId);
    const [delivery, absorbed] = await Promise.all([
      this.units.deliveryOf(groupId),
      this.units.absorbedByUnit(userIds, courseUnits),
    ]);

    const shares = absorbedOverall({ userIds, units: courseUnits, absorbed, delivery });
    const own = shares.get(studentId);
    const distribution = absorbedDistribution(shares);
    if (own === undefined || distribution === null) return null;

    const peers = [...shares.entries()]
      .filter(([userId]) => userId !== studentId)
      .map(([, share]) => share);

    // A learner with no classmates measured has no position, only a number of their own:
    // a percentile over an empty group would read as "top of the class".
    const percentile = percentileOf(own, peers);

    return {
      own: pct(own) as number,
      groupMedian: pct(distribution.median) as number,
      percentile: percentile ?? 50,
      lowerThan: peers.filter((share) => share < own).length,
      // Wide bands on purpose (§3.6): a learner should not move from "below" to "middle"
      // because of one homework, and the band is all their own screen is allowed to show.
      band: bandOf(percentile ?? 50),
      measured: shares.size,
    };
  }
}
