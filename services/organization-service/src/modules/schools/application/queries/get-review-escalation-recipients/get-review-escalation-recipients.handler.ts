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
  /** Why this person is on the list — a school role, or `primary` for a group's teacher. */
  role: string;
}

export interface ReviewEscalationRecipientsResult {
  /** Which of the three the school chose, so the caller can say who it wrote to and why. */
  target: EscalationTarget;
  recipients: EscalationRecipientDto[];
}

/** An owner is an administrator of their own school, whatever the roster calls them. */
const ADMIN_ROLES = ['OWNER', 'ADMIN'];

/**
 * The address behind `escalateTo` (plan 44 §44.12), resolved once, here.
 *
 * The setting names a *kind* of person — the school's admins, its owner, the group's
 * primary teacher — and turning that into user ids needs the roster, the group teachers
 * and the school's own choice. All three live here, and a notification job that worked it
 * out for itself would be a second copy of the rule, drifting the first time a school
 * adds an administrator.
 *
 * It never falls back to another target. A school that escalates to its owner and has
 * none gets an empty list, and the caller writes to nobody — quietly picking a different
 * recipient would send a stranger a school's dirty laundry, and hide that the setting
 * points at nobody.
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
      return { target, recipients: await this.primaryTeachers(query) };
    }

    const roles =
      target === ReviewEscalationTarget.OWNER ? ['OWNER'] : ADMIN_ROLES;
    return { target, recipients: await this.membersWithRoles(query.schoolId, roles) };
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
   */
  private async primaryTeachers(
    query: GetReviewEscalationRecipientsQuery,
  ): Promise<EscalationRecipientDto[]> {
    if (query.groupIds.length === 0) return [];

    const assignments = await (this.prisma as any).groupTeacher.findMany({
      where: {
        groupId: { in: query.groupIds },
        role: 'primary',
        AND: [
          { OR: [{ fromDate: null }, { fromDate: { lte: query.at } }] },
          { OR: [{ toDate: null }, { toDate: { gte: query.at } }] },
        ],
      },
      select: { userId: true },
    });

    const userIds = [...new Set(assignments.map((a: any) => String(a.userId)))];
    if (userIds.length === 0) return [];

    const members = await (this.prisma as any).schoolMember.findMany({
      where: { schoolId: query.schoolId, userId: { in: userIds } },
      select: { userId: true, name: true },
    });
    const nameById = new Map<string, string>(
      members.map((m: any) => [String(m.userId), (m.name as string | null) ?? String(m.userId)]),
    );

    return userIds.map((userId) => ({
      userId: userId as string,
      name: nameById.get(userId as string) ?? (userId as string),
      role: 'primary',
    }));
  }
}
