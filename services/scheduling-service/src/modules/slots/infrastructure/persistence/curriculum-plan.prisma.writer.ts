import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ICurriculumPlanWriter } from '../../application/ports/curriculum-plan.writer.js';
import type { CourseOutline } from '../../application/ports/course-outline.reader.js';
import { planUnitsFromOutline } from '../../application/services/derive-plan.js';

/** The weekly hours a derived plan starts from; the tutor can change it in the group. */
const DEFAULT_WEEKLY_HOURS = 1.5;

@Injectable()
export class CurriculumPlanPrismaWriter implements ICurriculumPlanWriter {
  private readonly logger = new Logger(CurriculumPlanPrismaWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureFromCourse(input: {
    groupId: string;
    schoolId: string;
    outline: CourseOutline;
  }): Promise<boolean> {
    const { groupId, schoolId, outline } = input;
    if (outline.units.length === 0) return false;

    const existing = await this.prisma.curriculumPlan.findUnique({ where: { groupId } });
    if (existing) return false;

    await this.prisma.curriculumPlan.create({
      data: {
        id: randomUUID(),
        groupId,
        schoolId,
        targetWeeklyHours: DEFAULT_WEEKLY_HOURS,
        updatedAt: new Date(),
        units: {
          create: planUnitsFromOutline(outline).map((unit) => ({
            id: randomUUID(),
            ...unit,
            status: 'planned',
            updatedAt: new Date(),
          })),
        },
      },
    });

    this.logger.log(`Derived a ${outline.units.length}-unit plan for group ${groupId}`);
    return true;
  }
}
