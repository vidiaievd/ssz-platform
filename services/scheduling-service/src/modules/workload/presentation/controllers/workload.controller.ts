import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  WorkloadPolicyDto,
  UpdateWorkloadPolicyDto,
  TeacherLoadDto,
  ConflictEntryDto,
  CommandCenterDto,
  TeacherAvailabilityQueryDto,
  TeacherAvailabilityEntryDto,
  TeacherTimetableEntryDto,
  SchoolTimetableEntryDto,
} from '../dto/workload.dto.js';
import { UpdateWorkloadPolicyCommand } from '../../application/commands/update-workload-policy/update-workload-policy.command.js';
import { WorkloadCalculatorService } from '../../application/services/workload-calculator.service.js';
import { OrgServiceHttpClient } from '../../../../infrastructure/org/org-service.http-client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

function defaultRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - from.getDay() + 1); // Monday of current week
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 6); // Sunday
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

@ApiTags('Workload')
@ApiBearerAuth()
@Controller('scheduling/schools/:schoolId')
export class WorkloadController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly calculator: WorkloadCalculatorService,
    private readonly orgClient: OrgServiceHttpClient,
    private readonly prisma: PrismaService,
  ) {}

  @Get('conflicts')
  @ApiOperation({ summary: 'List scheduling conflicts for a school' })
  @ApiResponse({ status: 200, type: [ConflictEntryDto] })
  @ApiQuery({ name: 'from', required: false, example: '2026-06-02' })
  @ApiQuery({ name: 'to', required: false, example: '2026-06-08' })
  async conflicts(
    @Param('schoolId') schoolId: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ): Promise<ConflictEntryDto[]> {
    const { from, to } = resolveRange(fromStr, toStr);
    return this.calculator.getConflicts(schoolId, from, to);
  }

  @Get('teachers/availability')
  @ApiOperation({ summary: 'Derived per-teacher availability (free/conflict/absent) for a proposed weekly slot set' })
  @ApiResponse({ status: 200, type: [TeacherAvailabilityEntryDto] })
  async teachersAvailability(
    @Param('schoolId') schoolId: string,
    @Query() query: TeacherAvailabilityQueryDto,
  ): Promise<TeacherAvailabilityEntryDto[]> {
    const teachers = await this.orgClient.getSchoolTeachers(schoolId);
    return this.calculator.getAvailability(schoolId, teachers.map((t) => t.userId), query.slots);
  }

  @Get('teachers/timetable')
  @ApiOperation({ summary: 'Weekly timetable projected from every teacher\'s assigned future lessons (one query for the whole school)' })
  @ApiResponse({ status: 200, type: [SchoolTimetableEntryDto] })
  async schoolTimetable(@Param('schoolId') schoolId: string): Promise<SchoolTimetableEntryDto[]> {
    return this.calculator.getSchoolTimetable(schoolId);
  }

  @Get('teachers/:teacherId/timetable')
  @ApiOperation({ summary: 'Weekly timetable projected from a teacher\'s assigned future lessons' })
  @ApiResponse({ status: 200, type: [TeacherTimetableEntryDto] })
  async teacherTimetable(
    @Param('teacherId') teacherId: string,
  ): Promise<TeacherTimetableEntryDto[]> {
    return this.calculator.getTeacherTimetable(teacherId);
  }

  @Get('teachers/:teacherId/load')
  @ApiOperation({ summary: 'Get workload summary for a teacher' })
  @ApiResponse({ status: 200, type: TeacherLoadDto })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async teacherLoad(
    @Param('schoolId') schoolId: string,
    @Param('teacherId') teacherId: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ): Promise<TeacherLoadDto> {
    const { from, to } = resolveRange(fromStr, toStr);
    const policy = await this.calculator.getPolicy(schoolId);
    return this.calculator.getTeacherLoad(teacherId, from, to, policy);
  }

  @Get('timetable')
  @ApiOperation({ summary: 'Weekly timetable for a school (all slots)' })
  @ApiResponse({ status: 200 })
  async timetable(@Param('schoolId') schoolId: string) {
    const slots = await this.prisma.slot.findMany({
      where: { schoolId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
    return slots;
  }

  @Get('command-center')
  @ApiOperation({ summary: 'Aggregated scheduling dashboard for a school' })
  @ApiResponse({ status: 200, type: CommandCenterDto })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async commandCenter(
    @Param('schoolId') schoolId: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ): Promise<CommandCenterDto> {
    const { from, to } = resolveRange(fromStr, toStr);
    const policy = await this.calculator.getPolicy(schoolId);

    const [conflicts, teachers] = await Promise.all([
      this.calculator.getConflicts(schoolId, from, to),
      this.orgClient.getSchoolTeachers(schoolId),
    ]);

    const teacherIds = teachers.map((t) => t.userId);
    const loads = await this.calculator.getSchoolLoadSummaries(schoolId, from, to, policy, teacherIds);

    return {
      conflictCount: conflicts.length,
      overloadedTeachers: loads.filter((l) => l.overloaded).length,
      nearCapTeachers: loads.filter((l) => l.health === 'warn').length,
      teacherLoads: loads,
    };
  }

  @Get('workload-policy')
  @ApiOperation({ summary: 'Get workload policy for a school' })
  @ApiResponse({ status: 200, type: WorkloadPolicyDto })
  async getPolicy(@Param('schoolId') schoolId: string): Promise<WorkloadPolicyDto> {
    return this.calculator.getPolicy(schoolId);
  }

  @Patch('workload-policy')
  @ApiOperation({ summary: 'Update workload policy for a school' })
  @ApiResponse({ status: 200 })
  async updatePolicy(
    @Param('schoolId') schoolId: string,
    @Body() body: UpdateWorkloadPolicyDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateWorkloadPolicyCommand(
        schoolId,
        body.prepFactor,
        body.dailyContactCap,
        body.maxConsecutive,
        body.nearCapRatio,
      ),
    );
  }
}

function resolveRange(fromStr?: string, toStr?: string): { from: Date; to: Date } {
  if (fromStr && toStr) {
    return { from: new Date(fromStr), to: new Date(toStr) };
  }
  return defaultRange();
}
