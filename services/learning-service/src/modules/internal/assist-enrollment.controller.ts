import { Controller, Get, NotFoundException, Query, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

/** A learner's hold on a course, as the student assistant reads it. */
export interface AssistEnrollment {
  status: 'active' | 'completed';
  /** The workspace the enrolment belongs to; null for self-study. */
  schoolId: string | null;
}

/**
 * Whether a learner holds a course, and through which workspace — ai-service's student
 * assistant asks before it reads a course's material and to settle who pays (plan 83,
 * step 3). A finished course is still the learner's to revise; one they left, or never
 * joined, answers 404 like an unknown course.
 *
 * Callers send `x-service-token` (not `x-internal-token`) and the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/enrollments')
export class AssistEnrollmentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('assist')
  async get(@Query('userId') userId?: string, @Query('courseId') courseId?: string): Promise<AssistEnrollment> {
    if (!userId || !courseId) throw new UnprocessableEntityException('userId and courseId are required');

    const row = await this.prisma.enrollment.findUnique({
      where: { userId_containerId: { userId, containerId: courseId } },
      select: { status: true, schoolId: true, deletedAt: true },
    });
    // Prisma hands back the enum member name (`ACTIVE`), not its mapped value.
    const status = row && row.deletedAt === null ? String(row.status) : null;
    if (status !== 'ACTIVE' && status !== 'COMPLETED') throw new NotFoundException('Enrollment not found');

    return { status: status === 'ACTIVE' ? 'active' : 'completed', schoolId: row!.schoolId };
  }
}
