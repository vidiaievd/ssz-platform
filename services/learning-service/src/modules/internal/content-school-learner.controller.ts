import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

// Any UUID version: seeded content and fixtures use v5.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SchoolLearnerAnswer {
  schoolId: string;
  userId: string;
  /** The user studied in the school: an enrolment or an assignment of it, in any status. */
  learner: boolean;
}

/**
 * Whether a user ever studied in a school (plan 90, Q11 — a closed or purged school's material
 * stays readable to its former learners). content-service asks after it refused a view of a
 * `school_private` piece of a school that is no longer active: organization answers no role
 * there, and its roster is gone after a purge, while enrolments and assignments stay here.
 *
 * Any status counts — a purge ends the school's enrolments as `COMPLETED`; only soft-deleted rows
 * do not. An assignment counts too: a group learner may study without an enrolment of their own.
 *
 * Callers send `x-service-token` (not `x-internal-token`) and the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/content')
export class ContentSchoolLearnerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('schools/:schoolId/learners/:userId')
  async isLearner(
    @Param('schoolId') schoolId: string,
    @Param('userId') userId: string,
  ): Promise<SchoolLearnerAnswer> {
    if (!UUID.test(schoolId) || !UUID.test(userId)) {
      throw new BadRequestException('schoolId and userId must be UUIDs');
    }

    const [enrollment, assignment] = await Promise.all([
      this.prisma.enrollment.findFirst({
        where: { userId, schoolId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.assignment.findFirst({
        where: { assigneeId: userId, schoolId, deletedAt: null },
        select: { id: true },
      }),
    ]);

    return { schoolId, userId, learner: enrollment !== null || assignment !== null };
  }
}
