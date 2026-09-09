import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  UpsertCurriculumDto,
  CreateUnitDto,
  PatchUnitDto,
  ReorderUnitsDto,
  LinkLessonUnitDto,
  CurriculumResponseDto,
} from '../dto/curriculum.dto.js';

type UnitRow = {
  id: string;
  title: string;
  order: number;
  plannedSessions: number;
  contentUnitId: string | null;
  requiredLevel: string | null;
  status: string;
};

@ApiTags('Curriculum')
@ApiBearerAuth()
@Controller('scheduling')
export class CurriculumController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * How much of each unit has actually been taught, counted from lessons marked
   * held. The unit's own `deliveredSessions` column is a leftover from when the
   * number was typed in by hand; the lessons are the record.
   */
  private async deliveredByUnit(groupId: string): Promise<Map<string, number>> {
    const held = await this.prisma.lesson.groupBy({
      by: ['curriculumUnitId'],
      where: { groupId, status: 'held', curriculumUnitId: { not: null } },
      _count: { _all: true },
    });
    return new Map(held.map((h) => [h.curriculumUnitId!, h._count._all]));
  }

  /**
   * A unit's state follows from what was taught — except when a person overrode
   * it, which is a statement about the plan and outranks the count.
   */
  private toUnitDto(unit: UnitRow, delivered: number) {
    const status =
      unit.status === 'overridden'
        ? 'overridden'
        : delivered >= unit.plannedSessions
          ? 'done'
          : delivered > 0
            ? 'active'
            : 'planned';

    return {
      id: unit.id,
      title: unit.title,
      order: unit.order,
      plannedSessions: unit.plannedSessions,
      deliveredSessions: delivered,
      contentUnitId: unit.contentUnitId,
      requiredLevel: unit.requiredLevel,
      status,
    };
  }

  @Get('groups/:groupId/curriculum')
  @ApiOperation({ summary: 'Get curriculum plan for a group' })
  @ApiResponse({ status: 200, type: CurriculumResponseDto })
  async get(@Param('groupId') groupId: string): Promise<CurriculumResponseDto | null> {
    const plan = await this.prisma.curriculumPlan.findUnique({
      where: { groupId },
      include: { units: { orderBy: { order: 'asc' } } },
    });
    if (!plan) return null;

    const delivered = await this.deliveredByUnit(groupId);
    return {
      id: plan.id,
      groupId: plan.groupId,
      schoolId: plan.schoolId,
      targetWeeklyHours: plan.targetWeeklyHours,
      units: plan.units.map((u) => this.toUnitDto(u, delivered.get(u.id) ?? 0)),
    };
  }

  @Put('groups/:groupId/curriculum')
  @ApiOperation({ summary: 'Create or update curriculum plan for a group' })
  @ApiResponse({ status: 200, type: CurriculumResponseDto })
  async upsert(
    @Param('groupId') groupId: string,
    @Body() body: UpsertCurriculumDto,
  ): Promise<CurriculumResponseDto> {
    // We need schoolId — derive from existing slots/lessons or default
    const slot = await this.prisma.slot.findFirst({ where: { groupId } });
    const schoolId = slot?.schoolId ?? 'unknown';

    const plan = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.curriculumPlan.upsert({
        where: { groupId },
        create: { groupId, schoolId, targetWeeklyHours: body.targetWeeklyHours },
        update: { targetWeeklyHours: body.targetWeeklyHours },
      });

      // Units are reconciled by id, not replaced: a unit that already has
      // lessons taught against it must survive an edit of the plan, because
      // deleting it nulls those links (onDelete: SetNull) and the group's
      // progress would quietly drop to zero.
      if (body.units) {
        const keptIds = body.units.map((u) => u.id).filter((id): id is string => Boolean(id));
        await tx.curriculumUnit.deleteMany({
          where: { planId: upserted.id, ...(keptIds.length && { id: { notIn: keptIds } }) },
        });

        for (const [index, u] of body.units.entries()) {
          const fields = {
            title: u.title,
            order: index + 1,
            plannedSessions: u.plannedSessions,
            contentUnitId: u.contentUnitId ?? null,
            requiredLevel: u.requiredLevel ?? null,
            status: (u.status ?? 'planned') as any,
          };
          if (u.id) {
            await tx.curriculumUnit.update({ where: { id: u.id }, data: fields });
          } else {
            await tx.curriculumUnit.create({ data: { planId: upserted.id, ...fields } });
          }
        }
      }

      return tx.curriculumPlan.findUniqueOrThrow({
        where: { id: upserted.id },
        include: { units: { orderBy: { order: 'asc' } } },
      });
    });

    const delivered = await this.deliveredByUnit(groupId);
    return {
      id: plan.id,
      groupId: plan.groupId,
      schoolId: plan.schoolId,
      targetWeeklyHours: plan.targetWeeklyHours,
      units: plan.units.map((u) => this.toUnitDto(u, delivered.get(u.id) ?? 0)),
    };
  }

  @Post('groups/:groupId/curriculum/units')
  @ApiOperation({ summary: 'Add a curriculum unit' })
  async addUnit(
    @Param('groupId') groupId: string,
    @Body() body: CreateUnitDto,
  ) {
    const plan = await this.prisma.curriculumPlan.findUniqueOrThrow({ where: { groupId } });
    const maxOrder = await this.prisma.curriculumUnit.aggregate({
      where: { planId: plan.id },
      _max: { order: true },
    });
    const order = (maxOrder._max.order ?? 0) + 1;
    const unit = await this.prisma.curriculumUnit.create({
      data: {
        planId: plan.id,
        title: body.title,
        order,
        plannedSessions: body.plannedSessions,
        requiredLevel: body.requiredLevel ?? null,
      },
    });
    // A unit nobody has taught yet: delivered is 0 by counting, not by default.
    return this.toUnitDto(unit, 0);
  }

  @Patch('curriculum/units/:unitId')
  @ApiOperation({ summary: 'Update a curriculum unit' })
  async patchUnit(@Param('unitId') unitId: string, @Body() body: PatchUnitDto) {
    const updated = await this.prisma.curriculumUnit.update({
      where: { id: unitId },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.contentUnitId !== undefined && { contentUnitId: body.contentUnitId }),
        ...(body.status !== undefined && { status: body.status as any }),
        ...(body.overrideReason !== undefined && { overrideReason: body.overrideReason }),
      },
      include: { plan: { select: { groupId: true } } },
    });
    const delivered = await this.deliveredByUnit(updated.plan.groupId);
    return this.toUnitDto(updated, delivered.get(updated.id) ?? 0);
  }

  @Post('curriculum/units/reorder')
  @HttpCode(204)
  @ApiOperation({ summary: 'Reorder curriculum units' })
  async reorder(@Body() body: ReorderUnitsDto): Promise<void> {
    await this.prisma.$transaction(
      body.unitIds.map((id, index) =>
        this.prisma.curriculumUnit.update({ where: { id }, data: { order: index + 1 } }),
      ),
    );
  }

  @Post('lessons/:lessonId/curriculum-unit')
  @ApiOperation({ summary: 'Link a lesson to a curriculum unit' })
  async linkLesson(
    @Param('lessonId') lessonId: string,
    @Body() body: LinkLessonUnitDto,
  ) {
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: { curriculumUnitId: body.curriculumUnitId },
    });
  }
}
