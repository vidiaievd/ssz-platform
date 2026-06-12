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

@ApiTags('Curriculum')
@ApiBearerAuth()
@Controller('scheduling')
export class CurriculumController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('groups/:groupId/curriculum')
  @ApiOperation({ summary: 'Get curriculum plan for a group' })
  @ApiResponse({ status: 200, type: CurriculumResponseDto })
  async get(@Param('groupId') groupId: string): Promise<CurriculumResponseDto | null> {
    const plan = await this.prisma.curriculumPlan.findUnique({
      where: { groupId },
      include: { units: { orderBy: { order: 'asc' } } },
    });
    if (!plan) return null;
    return {
      id: plan.id,
      groupId: plan.groupId,
      schoolId: plan.schoolId,
      targetWeeklyHours: plan.targetWeeklyHours,
      units: plan.units.map((u) => ({
        title: u.title,
        order: u.order,
        plannedSessions: u.plannedSessions,
        deliveredSessions: u.deliveredSessions,
        requiredLevel: u.requiredLevel,
        status: u.status,
      })),
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

    const plan = await this.prisma.curriculumPlan.upsert({
      where: { groupId },
      create: { groupId, schoolId, targetWeeklyHours: body.targetWeeklyHours },
      update: { targetWeeklyHours: body.targetWeeklyHours },
      include: { units: { orderBy: { order: 'asc' } } },
    });

    return {
      id: plan.id,
      groupId: plan.groupId,
      schoolId: plan.schoolId,
      targetWeeklyHours: plan.targetWeeklyHours,
      units: plan.units.map((u) => ({
        title: u.title, order: u.order,
        plannedSessions: u.plannedSessions, deliveredSessions: u.deliveredSessions,
        requiredLevel: u.requiredLevel, status: u.status,
      })),
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
    return this.prisma.curriculumUnit.create({
      data: {
        planId: plan.id,
        title: body.title,
        order,
        plannedSessions: body.plannedSessions,
        requiredLevel: body.requiredLevel ?? null,
      },
    });
  }

  @Patch('curriculum/units/:unitId')
  @ApiOperation({ summary: 'Update a curriculum unit' })
  async patchUnit(@Param('unitId') unitId: string, @Body() body: PatchUnitDto) {
    return this.prisma.curriculumUnit.update({
      where: { id: unitId },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.deliveredSessions !== undefined && { deliveredSessions: body.deliveredSessions }),
        ...(body.status !== undefined && { status: body.status as any }),
        ...(body.overrideReason !== undefined && { overrideReason: body.overrideReason }),
      },
    });
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
