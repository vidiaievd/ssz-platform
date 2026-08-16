import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetReviewScopeQuery } from './get-review-scope.query.js';

export interface ReviewScopeResult {
  groupIds: string[];
  containerIds: string[];
}

@QueryHandler(GetReviewScopeQuery)
export class GetReviewScopeHandler
  implements IQueryHandler<GetReviewScopeQuery, ReviewScopeResult>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetReviewScopeQuery): Promise<ReviewScopeResult> {
    // Same "active at" window as reviewers(sub) (DATA_MODEL.md §3), scoped to
    // one teacher across their whole school — this is what fills a teacher's
    // review queue, not a single group's roster.
    const assignments = await (this.prisma as any).groupTeacher.findMany({
      where: {
        userId: query.teacherId,
        AND: [
          { OR: [{ fromDate: null }, { fromDate: { lte: query.at } }] },
          { OR: [{ toDate: null }, { toDate: { gte: query.at } }] },
        ],
        group: { schoolId: query.schoolId, deletedAt: null },
      },
      select: { group: { select: { id: true, courseId: true } } },
    });

    const groupIds = new Set<string>();
    const containerIds = new Set<string>();
    for (const a of assignments) {
      groupIds.add(a.group.id);
      if (a.group.courseId) containerIds.add(a.group.courseId);
    }

    return { groupIds: [...groupIds], containerIds: [...containerIds] };
  }
}
