import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetReviewEscalationRecipientsQuery } from './get-review-escalation-recipients.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import {
  ReviewEscalationTarget,
  type ReviewEscalationTarget as EscalationTarget,
} from '../../../domain/value-objects/review-settings.vo.js';

export interface EscalationRecipientDto {
  userId: string;
  name: string;
  /**
   * Why this person is on the list — a school role, `primary` for a group's teacher, or
   * `school_admin_fallback` for an administrator standing in for a group with no primary.
   */
  role: string;
}

export interface ReviewEscalationRecipientsResult {
  /** Which of the three the school chose, so the caller can say who it wrote to and why. */
  target: EscalationTarget;
  recipients: EscalationRecipientDto[];
}

/** An owner is an administrator of their own school, whatever the roster calls them. */
const ADMIN_ROLES = ['OWNER', 'ADMIN'];

/** The role-reason of an administrator named because a group has no primary teacher. */
export const SCHOOL_ADMIN_FALLBACK = 'school_admin_fallback';

/**
 * The address behind `escalateTo` (plan 44 §44.12), resolved once, here.
 *
 * The setting names a *kind* of person — the school's admins, its owner, the group's
 * primary teacher — and turning that into user ids needs the roster, the group teachers
 * and the school's own choice. All three live here, and a notification job that worked it
 * out for itself would be a second copy of the rule, drifting the first time a school
 * adds an administrator.
 *
 * One fallback, and only one (OQ-13, decided 22.11): a group the late work belongs to
 * that has no live primary teacher is handed to the school's administrators — the owner
 * and every ADMIN, exactly as `school_admins` would name them — with the role-reason
 * `school_admin_fallback`, so the reader can tell they hear about it because the group
 * has nobody, not because the school chose them. Silence was the alternative, and a
 * setting that quietly swallows a group's late work is the worse of the two. The other
 * targets never fall back: an owner always exists, and admins include the owner.
 */
@QueryHandler(GetReviewEscalationRecipientsQuery)
export class GetReviewEscalationRecipientsHandler
  implements IQueryHandler<GetReviewEscalationRecipientsQuery, ReviewEscalationRecipientsResult>
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
  ) {}

  async execute(
    query: GetReviewEscalationRecipientsQuery,
  ): Promise<ReviewEscalationRecipientsResult> {
    const school = await this.schools.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);

    const target = school.reviewSettings.escalateTo;

    if (target === ReviewEscalationTarget.PRIMARY_TEACHER) {
      const { primaries, uncovered } = await this.primaryTeachers(query);
      if (uncovered.length === 0) return { target, recipients: primaries };

      // A group with nobody to answer for it goes to the school's administrators. A
      // primary teacher who is also an admin keeps the `primary` reason and is listed once.
      const admins = await this.admins(school.ownerId, query.schoolId, ADMIN_ROLES);
      const named = new Set(primaries.map((one) => one.userId));
      return {
        target,
        recipients: [
          ...primaries,
          ...admins
            .filter((one) => !named.has(one.userId))
            .map((one) => ({ ...one, role: SCHOOL_ADMIN_FALLBACK })),
        ],
      };
    }

    const roles = target === ReviewEscalationTarget.OWNER ? ['OWNER'] : ADMIN_ROLES;
    return { target, recipients: await this.admins(school.ownerId, query.schoolId, roles) };
  }

  /**
   * The owner plus the roster members with the given roles.
   *
   * The owner is the school's `ownerId` column, and is not necessarily on the roster
   * at all — most schools in the wild have no `OWNER` member row, only teachers and
   * students. Reading the roster alone made both admin targets answer "nobody" for an
   * ordinary school, which is the silent swallowing this query exists to prevent.
   */
  private async admins(
    ownerId: string,
    schoolId: string,
    roles: string[],
  ): Promise<EscalationRecipientDto[]> {
    const fromRoster = await this.membersWithRoles(schoolId, roles);
    const owner = await this.owner(ownerId, schoolId);
    return fromRoster.some((one) => one.userId === owner.userId)
      ? fromRoster
      : [owner, ...fromRoster];
  }

  /**
   * The school's owner, named from the roster if they happen to be on it.
   *
   * They are a recipient of both admin targets: of `owner` by definition, and of
   * `school_admins` because an owner is an administrator of their own school.
   */
  private async owner(userId: string, schoolId: string): Promise<EscalationRecipientDto> {
    const member = await (this.prisma as any).schoolMember.findFirst({
      where: { schoolId, userId },
      select: { name: true },
    });

    return { userId, name: (member?.name as string | null) ?? userId, role: 'OWNER' };
  }

  private async membersWithRoles(
    schoolId: string,
    roles: string[],
  ): Promise<EscalationRecipientDto[]> {
    const members = await (this.prisma as any).schoolMember.findMany({
      where: { schoolId, role: { in: roles } },
      select: { userId: true, name: true, role: true },
    });

    return members.map((member: any) => ({
      userId: member.userId,
      // The roster's own name, or the id: an escalation with an unnamed recipient is
      // still an escalation that reaches them.
      name: member.name ?? member.userId,
      role: String(member.role),
    }));
  }

  /**
   * The primary teachers of the groups the late work belongs to.
   *
   * Assignment active now, not when the work was handed in — the question here is who
   * should pick it up today. That is the opposite of `reviewers(sub)`, which asks who was
   * responsible at submission time, and the difference is deliberate: a substitution that
   * has ended should stop producing escalations, while the record of who was on duty then
   * must not change under anyone.
   *
   * `uncovered` is the given groups that have no live primary today — the ones the
   * administrators stand in for.
   */
  private async primaryTeachers(
    query: GetReviewEscalationRecipientsQuery,
  ): Promise<{ primaries: EscalationRecipientDto[]; uncovered: string[] }> {
    // No group given: nothing is late in a group, so no group is left without a teacher.
    if (query.groupIds.length === 0) return { primaries: [], uncovered: [] };

    const assignments = await (this.prisma as any).groupTeacher.findMany({
      where: {
        groupId: { in: query.groupIds },
        role: 'primary',
        AND: [
          { OR: [{ fromDate: null }, { fromDate: { lte: query.at } }] },
          { OR: [{ toDate: null }, { toDate: { gte: query.at } }] },
        ],
      },
      select: { userId: true, groupId: true },
    });

    const covered = new Set(assignments.map((a: any) => String(a.groupId)));
    const uncovered = [...new Set(query.groupIds)].filter((id) => !covered.has(id));

    const userIds = [...new Set(assignments.map((a: any) => String(a.userId)))];
    if (userIds.length === 0) return { primaries: [], uncovered };

    const members = await (this.prisma as any).schoolMember.findMany({
      where: { schoolId: query.schoolId, userId: { in: userIds } },
      select: { userId: true, name: true },
    });
    const nameById = new Map<string, string>(
      members.map((m: any) => [String(m.userId), (m.name as string | null) ?? String(m.userId)]),
    );

    const primaries = userIds.map((userId) => ({
      userId: userId as string,
      name: nameById.get(userId as string) ?? (userId as string),
      role: 'primary',
    }));
    return { primaries, uncovered };
  }
}
