import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetReviewReviewersQuery } from './get-review-reviewers.query.js';

export interface ReviewerDto {
  userId: string;
  name: string;
  role: string;
}

export interface ReviewerGroupDto {
  groupId: string;
  teachers: ReviewerDto[];
}

export interface ReviewReviewersResult {
  groups: ReviewerGroupDto[];
}

@QueryHandler(GetReviewReviewersQuery)
export class GetReviewReviewersHandler
  implements IQueryHandler<GetReviewReviewersQuery, ReviewReviewersResult>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetReviewReviewersQuery): Promise<ReviewReviewersResult> {
    if (query.groupIds.length === 0) return { groups: [] };

    // reviewers(sub) — GroupTeacher active at the submission date (DATA_MODEL.md §3):
    // an open-ended fromDate/toDate counts as active on either bound.
    const [assignments, groups] = await Promise.all([
      (this.prisma as any).groupTeacher.findMany({
        where: {
          groupId: { in: query.groupIds },
          AND: [
            { OR: [{ fromDate: null }, { fromDate: { lte: query.at } }] },
            { OR: [{ toDate: null }, { toDate: { gte: query.at } }] },
          ],
        },
      }),
      (this.prisma as any).schoolGroup.findMany({
        where: { id: { in: query.groupIds } },
        select: { id: true, schoolId: true },
      }),
    ]);

    const schoolIdByGroup = new Map<string, string>(
      groups.map((g: any) => [g.id, g.schoolId]),
    );

    const memberKeys = assignments
      .map((a: any) => {
        const schoolId = schoolIdByGroup.get(a.groupId);
        return schoolId ? { schoolId, userId: a.userId } : null;
      })
      .filter((k: unknown): k is { schoolId: string; userId: string } => k !== null);

    const members = memberKeys.length
      ? await (this.prisma as any).schoolMember.findMany({
          where: { OR: memberKeys },
          select: { schoolId: true, userId: true, name: true },
        })
      : [];
    const nameByKey = new Map<string, string>(
      members.map((m: any) => [`${m.schoolId}:${m.userId}`, m.name ?? m.userId]),
    );

    const byGroup = new Map<string, ReviewerDto[]>(query.groupIds.map((id) => [id, []]));
    for (const a of assignments) {
      const schoolId = schoolIdByGroup.get(a.groupId);
      const name = schoolId ? (nameByKey.get(`${schoolId}:${a.userId}`) ?? a.userId) : a.userId;
      byGroup.get(a.groupId)?.push({ userId: a.userId, name, role: a.role });
    }

    return {
      groups: query.groupIds.map((groupId) => ({
        groupId,
        teachers: byGroup.get(groupId) ?? [],
      })),
    };
  }
}
