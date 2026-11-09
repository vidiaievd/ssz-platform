import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { StudentAccessService } from '../../student-analytics/student-access.service.js';
import { WeakRulesReader } from '../weak-rules.reader.js';
import { GetGroupWeakRulesQuery, GetStudentWeakRulesQuery } from './weak-rules.queries.js';
import type { WeakRulesResponseDto } from '../dto/weak-rules-response.dto.js';

/**
 * Weak rules of a group — the rules its learners' work was flagged on (plan 85, step 10).
 * Access is membership of the group's school and no finer, as on the group's other routes.
 * A group with no course reads across the learners' flagged work of any course: the signal
 * exists without a course, and hiding it would say the group has no weak rules.
 */
@QueryHandler(GetGroupWeakRulesQuery)
@Injectable()
export class GetGroupWeakRulesHandler
  implements IQueryHandler<GetGroupWeakRulesQuery, WeakRulesResponseDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: WeakRulesReader,
  ) {}

  async execute(query: GetGroupWeakRulesQuery): Promise<WeakRulesResponseDto> {
    const group = await this.prisma.groupDirectory.findUnique({ where: { groupId: query.groupId } });
    if (!group) throw new NotFoundException('Group not found');

    const viewer = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId: group.schoolId, userId: query.viewerUserId } },
    });
    if (!viewer) throw new NotFoundException('Group not found');

    const roster = await this.prisma.groupMembership.findMany({
      where: { groupId: query.groupId },
      select: { userId: true },
    });

    return this.reader.read({
      userIds: roster.map((row) => row.userId),
      courseId: group.courseId,
      window: query.window,
    });
  }
}

/** Weak rules of one learner — for their teacher, and for themselves. */
@QueryHandler(GetStudentWeakRulesQuery)
@Injectable()
export class GetStudentWeakRulesHandler
  implements IQueryHandler<GetStudentWeakRulesQuery, WeakRulesResponseDto>
{
  constructor(
    private readonly access: StudentAccessService,
    private readonly reader: WeakRulesReader,
  ) {}

  async execute(query: GetStudentWeakRulesQuery): Promise<WeakRulesResponseDto> {
    await this.access.assertMayRead(query.studentId, query.viewerUserId);
    return this.reader.read({
      userIds: [query.studentId],
      courseId: query.courseId,
      window: query.window,
    });
  }
}
