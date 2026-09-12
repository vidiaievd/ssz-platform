import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetLearnerReviewContextQuery } from './get-learner-review-context.query.js';

export interface LearnerReviewContextResult {
  schoolId: string | null;
  groupId: string | null;
  groupName: string | null;
}

/**
 * Which workspace a learner's work belongs to, and which group inside it.
 *
 * The workspace comes from the *learner*, not from whoever owns the content: a
 * student working through a borrowed or public course still belongs to their own
 * school, and a private tutor's course owns no school at all (plan 59 §1.1 C).
 * The caller may name the content's school as a hint — it only breaks ties.
 *
 * Membership carries no historical bounds (school_group_members has addedAt/
 * exitedAt but the "active" check the platform relies on is the current
 * status, not a point-in-time reconstruction) — plan 44 §44.13 notes this
 * gap explicitly for the backfill script; this endpoint has the same limit.
 */
@QueryHandler(GetLearnerReviewContextQuery)
export class GetLearnerReviewContextHandler
  implements IQueryHandler<GetLearnerReviewContextQuery, LearnerReviewContextResult>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetLearnerReviewContextQuery): Promise<LearnerReviewContextResult> {
    const memberships = await (this.prisma as any).schoolGroupMember.findMany({
      where: {
        userId: query.userId,
        role: 'student',
        status: 'active',
        group: { deletedAt: null, school: { deletedAt: null } },
      },
      include: { group: { select: { id: true, name: true, courseId: true, schoolId: true } } },
    });

    if (memberships.length > 0) {
      const chosen = await this.pickGroup(memberships, query);
      return {
        schoolId: chosen.group.schoolId,
        groupId: chosen.group.id,
        groupName: chosen.group.name,
      };
    }

    // No group is not the same as no workspace. A learner on a school's roster but
    // outside every group is the row oversight already describes (plan 44 §0.4), and
    // it only exists if the work carries the school.
    const rosterRows = await (this.prisma as any).schoolMember.findMany({
      where: {
        userId: query.userId,
        role: 'student',
        status: 'active',
        school: { deletedAt: null },
      },
      select: { schoolId: true, joinedAt: true },
    });

    if (rosterRows.length === 0) return { schoolId: null, groupId: null, groupName: null };

    const preferred = query.preferredSchoolId
      ? rosterRows.find((r: any) => r.schoolId === query.preferredSchoolId)
      : undefined;
    const chosen =
      preferred ??
      rosterRows.reduce((latest: any, r: any) => (r.joinedAt > latest.joinedAt ? r : latest));

    return { schoolId: chosen.schoolId, groupId: null, groupName: null };
  }

  /**
   * Deterministic tie-break for a student sitting in more than one active group:
   * the group teaching the course in question wins, then a group taught by the person
   * whose content this is, then a group in the school that owns the content, then the
   * group joined most recently — never "whichever came back first".
   *
   * The author rule is what a learner who studies both at a school and with a private
   * tutor needs: their tutor's own course names no school and is tied to no group, so
   * without it the tutor's homework lands in the school's queue.
   */
  private async pickGroup(
    memberships: any[],
    query: GetLearnerReviewContextQuery,
  ): Promise<any> {
    const byCourse = query.courseId
      ? memberships.find((m) => m.group.courseId === query.courseId)
      : undefined;
    if (byCourse) return byCourse;

    if (query.preferredTeacherId && memberships.length > 1) {
      const byAuthor = await this.groupsTaughtBy(
        query.preferredTeacherId,
        memberships.map((m) => m.group.id),
      );
      const taught = memberships.find((m) => byAuthor.has(m.group.id));
      if (taught) return taught;
    }

    const bySchool = query.preferredSchoolId
      ? memberships.find((m) => m.group.schoolId === query.preferredSchoolId)
      : undefined;
    if (bySchool) return bySchool;

    return memberships.reduce((latest, m) => (m.addedAt > latest.addedAt ? m : latest));
  }

  /** Which of these groups that person teaches today — the same window reviewers use. */
  private async groupsTaughtBy(teacherId: string, groupIds: string[]): Promise<Set<string>> {
    const now = new Date();
    const rows = await (this.prisma as any).groupTeacher.findMany({
      where: {
        userId: teacherId,
        groupId: { in: groupIds },
        AND: [
          { OR: [{ fromDate: null }, { fromDate: { lte: now } }] },
          { OR: [{ toDate: null }, { toDate: { gte: now } }] },
        ],
      },
      select: { groupId: true },
    });
    return new Set<string>(rows.map((r: any) => r.groupId));
  }
}
