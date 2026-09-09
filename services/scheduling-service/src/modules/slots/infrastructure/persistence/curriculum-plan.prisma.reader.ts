import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ICurriculumPlanReader,
  PlannedUnit,
} from '../../application/ports/curriculum-plan.reader.js';

@Injectable()
export class CurriculumPlanPrismaReader implements ICurriculumPlanReader {
  constructor(private readonly prisma: PrismaService) {}

  async unitsForGroup(groupId: string): Promise<PlannedUnit[]> {
    const plan = await this.prisma.curriculumPlan.findUnique({
      where: { groupId },
      include: { units: { orderBy: { order: 'asc' } } },
    });
    if (!plan) return [];

    // Delivered is counted from held lessons rather than read off the unit: the
    // column is a cache, and the lessons are the record.
    const held = await this.prisma.lesson.groupBy({
      by: ['curriculumUnitId'],
      where: { groupId, status: 'held', curriculumUnitId: { not: null } },
      _count: { _all: true },
    });
    const heldByUnit = new Map(held.map((h) => [h.curriculumUnitId!, h._count._all]));

    return plan.units.map((u) => ({
      id: u.id,
      order: u.order,
      plannedSessions: u.plannedSessions,
      deliveredSessions: heldByUnit.get(u.id) ?? 0,
    }));
  }
}
