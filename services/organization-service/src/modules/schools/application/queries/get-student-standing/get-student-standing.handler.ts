import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetStudentStandingQuery } from './get-student-standing.query.js';

export interface StudentStandingResult {
  /** On the school's roster as a STUDENT, and not archived (removed students are archived, not deleted). */
  activeStudent: boolean;
  /**
   * An active student the school chose for its assistant (plan 83, Q6): every one under
   * `all_students`, none under `off`, an active member of a chosen group of the school under
   * `selected_groups`, a chosen student under `selected_students`.
   */
  assistantAllowed: boolean;
}

/**
 * Whether a learner is one of the school's current students, and one it pays the assistant
 * for — what the student assistant asks before the school pays for a learner's question
 * (plan 83, steps 3 and 3b). Staff, the owner and archived students are neither: the
 * school's agent is for the students it teaches now. A student outside the school's choice
 * is not refused by the assistant; they ask on their own plan.
 */
@QueryHandler(GetStudentStandingQuery)
@Injectable()
export class GetStudentStandingHandler implements IQueryHandler<GetStudentStandingQuery, StudentStandingResult> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetStudentStandingQuery): Promise<StudentStandingResult> {
    const prisma = this.prisma as any;
    const member = await prisma.schoolMember.findUnique({
      where: { schoolId_userId: { schoolId: query.schoolId, userId: query.userId } },
      select: {
        role: true,
        status: true,
        school: { select: { assistantMode: true, assistantGroupIds: true, assistantStudentIds: true } },
      },
    });
    const activeStudent = member?.role === 'STUDENT' && member?.status === 'active';
    if (!activeStudent) return { activeStudent: false, assistantAllowed: false };

    const school = member.school as { assistantMode: string; assistantGroupIds: string[]; assistantStudentIds: string[] };
    switch (school.assistantMode) {
      case 'all_students':
        return { activeStudent, assistantAllowed: true };
      case 'selected_students':
        return { activeStudent, assistantAllowed: school.assistantStudentIds.includes(query.userId) };
      case 'selected_groups': {
        if (school.assistantGroupIds.length === 0) return { activeStudent, assistantAllowed: false };
        // The group must be the school's own: the saved list is checked on save, but a
        // stray id must never let another school's group decide who this one pays for.
        const seat = await prisma.schoolGroupMember.findFirst({
          where: {
            userId: query.userId,
            status: 'active',
            groupId: { in: school.assistantGroupIds },
            group: { schoolId: query.schoolId, deletedAt: null },
          },
          select: { id: true },
        });
        return { activeStudent, assistantAllowed: seat !== null };
      }
      default:
        return { activeStudent, assistantAllowed: false };
    }
  }
}
