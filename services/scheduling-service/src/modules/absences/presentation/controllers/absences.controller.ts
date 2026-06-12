import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { SubstituteRequestGeneratorService } from '../../application/services/substitute-request-generator.service.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { CreateAbsenceDto, AbsenceResponseDto } from '../dto/absence.dto.js';
import type { TeacherAbsence } from '../../domain/entities/teacher-absence.entity.js';

function toDto(row: {
  id: string; schoolId: string; teacherId: string;
  kind: string; scope: string;
  fromDate: Date; toDate: Date | null;
  reason: string; createdBy: string; createdAt: Date;
}): AbsenceResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    teacherId: row.teacherId,
    kind: row.kind,
    scope: row.scope,
    fromDate: row.fromDate.toISOString().slice(0, 10),
    toDate: row.toDate ? row.toDate.toISOString().slice(0, 10) : null,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

@ApiTags('Absences')
@ApiBearerAuth()
@Controller('scheduling')
export class AbsencesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestGenerator: SubstituteRequestGeneratorService,
  ) {}

  @Get('schools/:schoolId/absences')
  @ApiOperation({ summary: 'List absences for a school' })
  @ApiResponse({ status: 200, type: [AbsenceResponseDto] })
  async listBySchool(
    @Param('schoolId') schoolId: string,
    @Query('teacherId') teacherId?: string,
  ): Promise<AbsenceResponseDto[]> {
    const rows = await this.prisma.teacherAbsence.findMany({
      where: { schoolId, ...(teacherId && { teacherId }) },
      orderBy: { fromDate: 'desc' },
    });
    return rows.map(toDto);
  }

  @Get('teachers/:teacherId/absences')
  @ApiOperation({ summary: 'List absences for a specific teacher' })
  @ApiResponse({ status: 200, type: [AbsenceResponseDto] })
  async listByTeacher(
    @Param('teacherId') teacherId: string,
  ): Promise<AbsenceResponseDto[]> {
    const rows = await this.prisma.teacherAbsence.findMany({
      where: { teacherId },
      orderBy: { fromDate: 'desc' },
    });
    return rows.map(toDto);
  }

  @Post('schools/:schoolId/teachers/:teacherId/absences')
  @ApiOperation({ summary: 'Report a teacher absence' })
  @ApiResponse({ status: 201, type: AbsenceResponseDto })
  async create(
    @Param('schoolId') schoolId: string,
    @Param('teacherId') teacherId: string,
    @Body() body: CreateAbsenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AbsenceResponseDto> {
    const row = await this.prisma.teacherAbsence.create({
      data: {
        schoolId,
        teacherId,
        kind: body.kind as any,
        scope: body.scope as any,
        fromDate: new Date(body.fromDate),
        toDate: body.toDate ? new Date(body.toDate) : null,
        reason: body.reason,
        createdBy: user.userId,
      },
    });

    const absence: TeacherAbsence = {
      id: row.id,
      schoolId: row.schoolId,
      teacherId: row.teacherId,
      kind: row.kind as any,
      scope: row.scope as any,
      fromDate: row.fromDate,
      toDate: row.toDate,
      reason: row.reason,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };

    // Auto-generate substitute requests for covered lessons
    await this.requestGenerator.generateForAbsence(absence);

    return toDto(row);
  }

  @Delete('absences/:absenceId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an absence record' })
  @ApiResponse({ status: 204 })
  async remove(@Param('absenceId') absenceId: string): Promise<void> {
    await this.prisma.teacherAbsence.delete({ where: { id: absenceId } });
  }
}
