import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetStudentReviewGroupQuery } from './get-student-review-group.query.js';

export interface StudentReviewGroupResult {
  groupId: string | null;
  groupName: string | null;
}

// Membership carries no historical bounds (school_group_members has addedAt/
// exitedAt but the "active" check the platform relies on is the current
// status, not a point-in-time reconstruction) — plan 44 §44.13 notes this
// gap explicitly for the backfill script; this endpoint has the same limit.
@QueryHandler(GetStudentReviewGroupQuery)
export class GetStudentReviewGroupHandler
  implements IQueryHandler<GetStudentReviewGroupQuery, StudentReviewGroupResult>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetStudentReviewGroupQuery): Promise<StudentReviewGroupResult> {
    const memberships = await (this.prisma as any).schoolGroupMember.findMany({
      where: {
        userId: query.userId,
        role: 'student',
        status: 'active',
        group: { schoolId: query.schoolId, deletedAt: null },
      },
      include: { group: { select: { id: true, name: true, courseId: true } } },
    });

    if (memberships.length === 0) return { groupId: null, groupName: null };

    // Deterministic tie-break for a student sitting in more than one active
    // group: the group teaching the course in question wins; otherwise the
    // group joined most recently — never "whichever came back first".
    const byCourse = query.courseId
      ? memberships.find((m: any) => m.group.courseId === query.courseId)
      : undefined;
    const chosen =
      byCourse ??
      memberships.reduce((latest: any, m: any) =>
        m.addedAt > latest.addedAt ? m : latest,
      );

    return { groupId: chosen.group.id, groupName: chosen.group.name };
  }
}
