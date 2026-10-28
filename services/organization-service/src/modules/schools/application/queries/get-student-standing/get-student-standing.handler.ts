import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetStudentStandingQuery } from './get-student-standing.query.js';

export interface StudentStandingResult {
  /** On the school's roster as a STUDENT, and not archived (removed students are archived, not deleted). */
  activeStudent: boolean;
}

/**
 * Whether a learner is one of the school's current students — what the student assistant
 * asks before the school pays for a learner's question (plan 83, step 3). Staff, the owner
 * and archived students are not: the school's agent is for the students it teaches now.
 */
@QueryHandler(GetStudentStandingQuery)
@Injectable()
export class GetStudentStandingHandler implements IQueryHandler<GetStudentStandingQuery, StudentStandingResult> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetStudentStandingQuery): Promise<StudentStandingResult> {
    const member = await (this.prisma as any).schoolMember.findUnique({
      where: { schoolId_userId: { schoolId: query.schoolId, userId: query.userId } },
      select: { role: true, status: true },
    });
    return { activeStudent: member?.role === 'STUDENT' && member?.status === 'active' };
  }
}
