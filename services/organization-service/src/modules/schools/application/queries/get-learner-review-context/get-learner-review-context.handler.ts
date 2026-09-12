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
      const chosen = this.pickGroup(memberships, query);
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
   * the group teaching the course in question wins, then a group in the school
   * that owns the content, then the group joined most recently — never
   * "whichever came back first".
   */
  private pickGroup(memberships: any[], query: GetLearnerReviewContextQuery): any {
    const byCourse = query.courseId
      ? memberships.find((m) => m.group.courseId === query.courseId)
      : undefined;
    if (byCourse) return byCourse;

    const bySchool = query.preferredSchoolId
      ? memberships.find((m) => m.group.schoolId === query.preferredSchoolId)
      : undefined;
    if (bySchool) return bySchool;

    return memberships.reduce((latest, m) => (m.addedAt > latest.addedAt ? m : latest));
  }
}
