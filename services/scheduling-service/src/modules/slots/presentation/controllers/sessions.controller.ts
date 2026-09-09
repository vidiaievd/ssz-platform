import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  LESSON_REPOSITORY,
  type ILessonRepository,
} from '../../domain/repositories/lesson.repository.interface.js';
import { LessonGeneratorService } from '../../application/services/lesson-generator.service.js';
import { SessionAccessService } from '../../application/services/session-access.service.js';
import { SessionWriterService } from '../../application/services/session-writer.service.js';
import { OrgServiceHttpClient } from '../../../../infrastructure/org/org-service.http-client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import {
  CreateSessionDto,
  GradingPolicyDto,
  PatchSessionDto,
  PutScoresDto,
  RegenerateResultDto,
  SessionResponseDto,
  toSessionDto,
} from '../dto/session.dto.js';

/** The pass mark a school falls back on, matching the column default. */
const DEFAULT_PASS_MARK = 60;

@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('scheduling')
export class SessionsController {
  constructor(
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
    private readonly writer: SessionWriterService,
    private readonly generator: LessonGeneratorService,
    private readonly access: SessionAccessService,
    private readonly orgClient: OrgServiceHttpClient,
    private readonly prisma: PrismaService,
  ) {}

  @Get('schools/:schoolId/groups/:groupId/sessions')
  @ApiOperation({
    summary: 'Every session of a group, oldest first',
    description:
      'Deliberately not windowed by date: the log reads a whole course at once, and a window would cut the history it exists to show.',
  })
  @ApiResponse({ status: 200, type: [SessionResponseDto] })
  async list(
    @Param('schoolId') schoolId: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionResponseDto[]> {
    await this.access.requireReader(schoolId, user);
    const sessions = await this.lessons.findAllByGroup(groupId);
    return sessions.map(toSessionDto);
  }

  @Post('schools/:schoolId/groups/:groupId/sessions')
  @ApiOperation({ summary: 'Add a session outside the weekly pattern' })
  @ApiResponse({ status: 201, type: SessionResponseDto })
  @ApiResponse({ status: 403, description: 'A teacher may add only their own make-up class' })
  async create(
    @Param('schoolId') schoolId: string,
    @Param('groupId') groupId: string,
    @Body() body: CreateSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionResponseDto> {
    const created = await this.writer.create({ ...body, groupId, schoolId }, user);
    return toSessionDto(created);
  }

  @Patch('sessions/:sessionId')
  @ApiOperation({ summary: 'Change one session: reschedule, retopic, reassign, or record it' })
  @ApiResponse({ status: 200, type: SessionResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Held before it happened, incoherent times, or attendance on an exam',
  })
  @ApiResponse({ status: 403, description: 'Not this teacher’s session, or not their field' })
  @ApiResponse({ status: 404, description: 'No such session' })
  async patch(
    @Param('sessionId') sessionId: string,
    @Body() body: PatchSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionResponseDto> {
    const updated = await this.writer.patch(sessionId, body, user);
    return toSessionDto(updated);
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({
    summary: 'Delete an extra session',
    description:
      'Only a session added by hand can be deleted. One the plan calls for is cancelled instead: it stays in the record, and its topic stays untaught.',
  })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 409, description: 'Part of the plan — cancel it instead' })
  async remove(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ deleted: boolean }> {
    await this.writer.remove(sessionId, user);
    return { deleted: true };
  }

  @Put('sessions/:sessionId/scores')
  @ApiOperation({ summary: 'Write the marks of one exam' })
  @ApiResponse({ status: 200, type: SessionResponseDto })
  @ApiResponse({ status: 400, description: 'Not an exam, or the same student graded twice' })
  async putScores(
    @Param('sessionId') sessionId: string,
    @Body() body: PutScoresDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionResponseDto> {
    const updated = await this.writer.putScores(sessionId, body.scores, user);
    return toSessionDto(updated);
  }

  @Post('schools/:schoolId/groups/:groupId/sessions/regenerate')
  @ApiOperation({
    summary: 'Re-lay the untaught part of the plan',
    description:
      'For a course change or a pattern change. Sessions held, cancelled or added by hand are left exactly as they are.',
  })
  @ApiResponse({ status: 200, type: RegenerateResultDto })
  async regenerate(
    @Param('schoolId') schoolId: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RegenerateResultDto> {
    await this.access.requireManager(schoolId, user);

    const [group, teachers, slots] = await Promise.all([
      this.orgClient.getGroup(schoolId, groupId),
      this.orgClient.getGroupTeachers(schoolId, groupId),
      this.prisma.slot.findMany({ where: { groupId } }),
    ]);
    if (!group) throw new NotFoundException(`Group ${groupId} not found in school ${schoolId}`);

    const existing = await this.lessons.findAllByGroup(groupId);
    // Each of these is a reason a plan cannot exist yet, not a failure. The
    // caller shows them; a 4xx would say the request was wrong, and it was not.
    const blocker = !group.startDate
      ? 'The group has no start date'
      : !slots.length
        ? 'The group has no weekly pattern'
        : !group.courseId
          ? 'No course is linked to the group'
          : null;
    if (blocker) return { planned: 0, kept: existing.length, reason: blocker };

    const primary = teachers.find((t) => t.role === 'primary');
    const planned = await this.generator.regenerateTail({
      groupId,
      schoolId,
      teacherId: primary?.userId ?? null,
      slots,
      courseId: group.courseId ?? null,
      startDate: new Date(group.startDate!),
    });

    const after = await this.lessons.findAllByGroup(groupId);
    return {
      planned: planned.length,
      kept: after.length - planned.length,
      reason: planned.length ? null : 'The course has nothing published to teach',
    };
  }

  @Get('schools/:schoolId/grading-policy')
  @ApiOperation({ summary: 'The score at which a student passes an exam' })
  @ApiResponse({ status: 200, type: GradingPolicyDto })
  async gradingPolicy(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GradingPolicyDto> {
    await this.access.requireReader(schoolId, user);
    const policy = await this.prisma.gradingPolicy.findUnique({ where: { schoolId } });
    return { passMark: policy?.passMark ?? DEFAULT_PASS_MARK };
  }

  @Put('schools/:schoolId/grading-policy')
  @ApiOperation({ summary: 'Set the school pass mark' })
  @ApiResponse({ status: 200, type: GradingPolicyDto })
  async setGradingPolicy(
    @Param('schoolId') schoolId: string,
    @Body() body: GradingPolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GradingPolicyDto> {
    await this.access.requireManager(schoolId, user);
    const saved = await this.prisma.gradingPolicy.upsert({
      where: { schoolId },
      create: { schoolId, passMark: body.passMark },
      update: { passMark: body.passMark },
    });
    return { passMark: saved.passMark };
  }
}
