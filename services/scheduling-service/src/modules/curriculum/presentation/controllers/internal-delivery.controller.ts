import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';

/** One unit of the teaching plan, with what the lesson log says about it. */
interface DeliveryUnit {
  curriculumUnitId: string;
  title: string;
  order: number;
  plannedSessions: number;
  /** Unit of the linked course, or `null` for a plan unit nobody stitched. */
  contentUnitId: string | null;
  lessonsHeld: number;
  lastHeldAt: string | null;
}

export interface GroupDeliveryResponse {
  groupId: string;
  /** `null` when the group has no teaching plan at all — a legal state, not a failure. */
  planId: string | null;
  lessonsHeld: number;
  lessonsPlanned: number;
  units: DeliveryUnit[];
}

/**
 * What a group was actually taught — asked by analytics, not projected there (plan 58 §2 G).
 *
 * `delivered` changes the moment a teacher marks a lesson held, and this service already
 * counts it for the curriculum screen. A copy of the count in analytics would be a second
 * reading of the same log, and the two would part company on the first lesson somebody
 * un-marked — with the group's progress chart disagreeing with the journal the same
 * teacher is looking at.
 *
 * `@Public()` takes the route out of the JWT guard's hands: the caller is a service and
 * carries no user token. The internal guard beside it is what actually admits it.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/groups')
export class InternalDeliveryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':groupId/delivery')
  async delivery(@Param('groupId') groupId: string): Promise<GroupDeliveryResponse> {
    const plan = await this.prisma.curriculumPlan.findUnique({
      where: { groupId },
      include: { units: { orderBy: { order: 'asc' } } },
    });

    // Cancelled lessons are not part of the plan's size: they were taken out of it on
    // purpose, and leaving them in would make a group that lost a week to illness look
    // like a group that is behind.
    const [held, heldTotal, planned] = await Promise.all([
      this.prisma.lesson.groupBy({
        by: ['curriculumUnitId'],
        where: { groupId, status: 'held', curriculumUnitId: { not: null } },
        _count: { _all: true },
        _max: { date: true },
      }),
      // Every held lesson, including those against no unit: the summary line is about
      // the group's term, and a lesson nobody stitched to a unit still happened.
      this.prisma.lesson.count({ where: { groupId, status: 'held' } }),
      this.prisma.lesson.count({ where: { groupId, status: { not: 'cancelled' } } }),
    ]);

    const byUnit = new Map(held.map((row) => [row.curriculumUnitId as string, row]));

    return {
      groupId,
      planId: plan?.id ?? null,
      lessonsHeld: heldTotal,
      lessonsPlanned: planned,
      units: (plan?.units ?? []).map((unit) => {
        const row = byUnit.get(unit.id);
        return {
          curriculumUnitId: unit.id,
          title: unit.title,
          order: unit.order,
          plannedSessions: unit.plannedSessions,
          contentUnitId: unit.contentUnitId,
          lessonsHeld: row?._count._all ?? 0,
          lastHeldAt: row?._max.date?.toISOString() ?? null,
        };
      }),
    };
  }
}
