import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { Roles } from '../../../../common/decorators/roles.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { GetPublicSchoolQuery } from '../../application/queries/get-public-school/get-public-school.query.js';
import { ListPublicSchoolsQuery } from '../../application/queries/list-public-schools/list-public-schools.query.js';
import { CheckNameAvailableQuery } from '../../application/queries/check-name-available/check-name-available.query.js';
import { CheckSlugAvailableQuery } from '../../application/queries/check-slug-available/check-slug-available.query.js';
import { GetSchoolBySlugQuery } from '../../application/queries/get-school-by-slug/get-school-by-slug.query.js';
import { CreateSchoolCommand } from '../../application/commands/create-school/create-school.command.js';
import { UpdateSchoolCommand } from '../../application/commands/update-school/update-school.command.js';
import { DeleteSchoolCommand } from '../../application/commands/delete-school/delete-school.command.js';
import { AddMemberCommand } from '../../application/commands/add-member/add-member.command.js';
import { RemoveMemberCommand } from '../../application/commands/remove-member/remove-member.command.js';
import { GetSchoolQuery } from '../../application/queries/get-school/get-school.query.js';
import { ListMySchoolsQuery } from '../../application/queries/list-my-schools/list-my-schools.query.js';
import { ListSchoolMembersQuery } from '../../application/queries/list-school-members/list-school-members.query.js';
import { GetStudentDetailQuery } from '../../application/queries/get-student-detail/get-student-detail.query.js';
import { GetStudentMembershipsQuery } from '../../application/queries/get-student-memberships/get-student-memberships.query.js';
import { GetStudentHistoryQuery } from '../../application/queries/get-student-history/get-student-history.query.js';
import { UpdateStudentCommand } from '../../application/commands/update-student/update-student.command.js';
import { TransferStudentCommand } from '../../application/commands/transfer-student/transfer-student.command.js';
import { RemoveStudentCommand } from '../../application/commands/remove-student/remove-student.command.js';
import { NudgeStudentCommand } from '../../application/commands/nudge-student/nudge-student.command.js';
import { CreateSchoolRequestDto } from '../dto/create-school.request.dto.js';
import { UpdateSchoolRequestDto } from '../dto/update-school.request.dto.js';
import { AddMemberRequestDto } from '../dto/add-member.request.dto.js';
import {
  MemberRosterItemResponseDto,
  PublicSchoolResponseDto,
  SchoolResponseDto,
  SchoolSummaryResponseDto,
  SlugAvailabilityResponseDto,
} from '../dto/school.response.dto.js';
import { StudentDetailResponseDto } from '../dto/student-detail.response.dto.js';
import { StudentMembershipResponseDto } from '../dto/student-membership.response.dto.js';
import { StudentLevelHistoryEntryResponseDto } from '../dto/student-level-history.response.dto.js';
import { NudgeStudentResponseDto } from '../dto/nudge-student.response.dto.js';
import { UpdateStudentRequestDto } from '../dto/update-student.request.dto.js';
import { TransferStudentRequestDto } from '../dto/transfer-student.request.dto.js';
import { MemberRole } from '../../domain/value-objects/member-role.vo.js';

@ApiTags('Schools')
@ApiBearerAuth('JWT')
@Controller('schools')
export class SchoolsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @Roles('school_admin')
  @ApiOperation({ summary: 'Create a new school' })
  @ApiResponse({ status: 201, type: SchoolResponseDto })
  @ApiResponse({ status: 403, description: 'Requires school_admin platform role' })
  @ApiResponse({ status: 409, description: 'Name or slug already taken' })
  async createSchool(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSchoolRequestDto,
  ): Promise<SchoolResponseDto> {
    return this.commandBus.execute(
      new CreateSchoolCommand(
        user.sub,
        dto.name,
        dto.slug,
        dto.description,
        dto.avatarUrl,
        dto.website,
        dto.contactEmail,
        dto.city,
        dto.type,
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all schools I own or belong to' })
  @ApiResponse({ status: 200, type: [SchoolSummaryResponseDto] })
  async listMySchools(
    @CurrentUser() user: JwtPayload,
  ): Promise<SchoolSummaryResponseDto[]> {
    return this.queryBus.execute(new ListMySchoolsQuery(user.sub));
  }

  @Get('name-available')
  @ApiOperation({ summary: 'Check whether a school name is available' })
  @ApiResponse({ status: 200, schema: { example: { available: true } } })
  async checkNameAvailable(
    @Query('name') name: string,
  ): Promise<{ available: boolean }> {
    return this.queryBus.execute(new CheckNameAvailableQuery(name));
  }

  @Get('slug-available')
  @ApiOperation({ summary: 'Check whether a school slug is available' })
  @ApiResponse({ status: 200, type: SlugAvailabilityResponseDto })
  async checkSlugAvailable(
    @Query('slug') slug: string,
  ): Promise<SlugAvailabilityResponseDto> {
    return this.queryBus.execute(new CheckSlugAvailableQuery(slug));
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'List all active schools (no auth required)' })
  @ApiResponse({ status: 200, type: [PublicSchoolResponseDto] })
  async listPublicSchools(): Promise<PublicSchoolResponseDto[]> {
    return this.queryBus.execute(new ListPublicSchoolsQuery());
  }

  @Public()
  @Get('public/:slug')
  @ApiOperation({ summary: 'Get public school page (no auth required)' })
  @ApiResponse({ status: 200, type: PublicSchoolResponseDto })
  @ApiResponse({ status: 404, description: 'School not found or inactive' })
  async getPublicSchool(
    @Param('slug') slug: string,
  ): Promise<PublicSchoolResponseDto> {
    return this.queryBus.execute(new GetPublicSchoolQuery(slug));
  }

  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Get school by URL slug (members only)' })
  @ApiResponse({ status: 200, type: SchoolResponseDto })
  @ApiResponse({ status: 403, description: 'Not a member' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async getSchoolBySlug(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
  ): Promise<SchoolResponseDto> {
    return this.queryBus.execute(new GetSchoolBySlugQuery(slug, user.sub));
  }

  @Get(':schoolId')
  @ApiOperation({ summary: 'Get school details (members only)' })
  @ApiResponse({ status: 200, type: SchoolResponseDto })
  @ApiResponse({ status: 403, description: 'Not a member' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async getSchool(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<SchoolResponseDto> {
    return this.queryBus.execute(new GetSchoolQuery(schoolId, user.sub));
  }

  @Patch(':schoolId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update school details and policies (owner/admin)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  @ApiResponse({ status: 409, description: 'Slug already taken' })
  async updateSchool(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: UpdateSchoolRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateSchoolCommand(
        user.sub,
        schoolId,
        dto.name,
        dto.slug,
        dto.description,
        dto.avatarUrl,
        dto.website,
        dto.contactEmail,
        dto.city,
        dto.type,
        dto.requireTutorReviewForSelfPaced,
        dto.defaultExplanationLanguage,
      ),
    );
  }

  @Delete(':schoolId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a school (owner only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async deleteSchool(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteSchoolCommand(user.sub, schoolId));
  }

  @Post(':schoolId/members')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add a member directly (owner/admin only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  @ApiResponse({ status: 409, description: 'Member already exists' })
  async addMember(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: AddMemberRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AddMemberCommand(user.sub, schoolId, dto.userId, dto.role),
    );
  }

  @Delete(':schoolId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the school (or leave)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveMemberCommand(user.sub, schoolId, userId),
    );
  }

  @Get(':schoolId/students')
  @ApiOperation({
    summary: 'List students enrolled in the school (OWNER/ADMIN)',
    description: 'Returns all school members with STUDENT role, enriched with profile data.',
  })
  @ApiResponse({ status: 200, type: [MemberRosterItemResponseDto] })
  @ApiResponse({ status: 403, description: 'Not a member of this school' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async listStudents(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<MemberRosterItemResponseDto[]> {
    return this.queryBus.execute(
      new ListSchoolMembersQuery(user.sub, schoolId, MemberRole.STUDENT),
    );
  }

  @Get(':schoolId/students/:userId')
  @ApiOperation({
    summary: 'Get a single student’s detail (OWNER/ADMIN/SCHEDULER/own teacher/self)',
    description:
      'OWNER/ADMIN/SCHEDULER see everything; TEACHER sees only their own students; the student can see their own record.',
  })
  @ApiResponse({ status: 200, type: StudentDetailResponseDto })
  @ApiResponse({ status: 403, description: 'Not authorized to view this student' })
  @ApiResponse({ status: 404, description: 'School not found or userId is not a student of this school' })
  async getStudent(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<StudentDetailResponseDto> {
    return this.queryBus.execute(
      new GetStudentDetailQuery(user.sub, schoolId, userId),
    );
  }

  @Get(':schoolId/students/:userId/memberships')
  @ApiOperation({
    summary: 'Get a student’s group membership history (active + past)',
    description:
      'OWNER/ADMIN/SCHEDULER see everything; TEACHER sees only groups they teach; the student can see their own.',
  })
  @ApiResponse({ status: 200, type: [StudentMembershipResponseDto] })
  @ApiResponse({ status: 403, description: 'Not authorized to view this student' })
  @ApiResponse({ status: 404, description: 'School not found or userId is not a student of this school' })
  async getStudentMemberships(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<StudentMembershipResponseDto[]> {
    return this.queryBus.execute(
      new GetStudentMembershipsQuery(user.sub, schoolId, userId),
    );
  }

  @Get(':schoolId/students/:userId/history')
  @ApiOperation({
    summary: "Get a student's CEFR level progression history",
    description:
      'OWNER/ADMIN/SCHEDULER see everything; TEACHER sees only their own students; the student can see their own.',
  })
  @ApiResponse({ status: 200, type: [StudentLevelHistoryEntryResponseDto] })
  @ApiResponse({ status: 403, description: 'Not authorized to view this student' })
  @ApiResponse({ status: 404, description: 'School not found or userId is not a student of this school' })
  async getStudentHistory(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<StudentLevelHistoryEntryResponseDto[]> {
    return this.queryBus.execute(
      new GetStudentHistoryQuery(user.sub, schoolId, userId),
    );
  }

  @Patch(':schoolId/students/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archive/reactivate a student and/or change their CEFR level',
    description:
      'OWNER/ADMIN can change status and/or level. TEACHER can only change level, only for their own students.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found or userId is not a student of this school' })
  async updateStudent(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateStudentRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateStudentCommand(user.sub, schoolId, userId, dto.status, dto.level),
    );
  }

  @Post(':schoolId/students/:userId/transfer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Atomically transfer a student between two groups (owner/admin/teacher)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School or target group not found' })
  @ApiResponse({ status: 409, description: 'clash | capacity — pass ?override=true to force' })
  @ApiResponse({ status: 422, description: 'target-archived | already-member | source-not-found' })
  async transferStudent(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: TransferStudentRequestDto,
    @Query('override') override?: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new TransferStudentCommand(
        user.sub,
        schoolId,
        userId,
        dto.fromGroupId,
        dto.toGroupId,
        dto.role ?? 'student',
        override === 'true',
      ),
    );
  }

  @Delete(':schoolId/students/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a student from the school (owner/admin)',
    description:
      'Deactivates the student (status=archived) and exits all their active groups, preserving membership/level history. Does not erase the student record.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found or userId is not a student of this school' })
  async removeStudent(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.commandBus.execute(new RemoveStudentCommand(user.sub, schoolId, userId));
  }

  @Post(':schoolId/students/:userId/nudge')
  @ApiOperation({ summary: 'Send an individual study-reminder nudge to a student (owner/admin/teacher)' })
  @ApiResponse({ status: 200, type: NudgeStudentResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found or userId is not a student of this school' })
  @ApiResponse({ status: 429, description: 'Rate-limited — at most one nudge per student per 24h' })
  async nudgeStudent(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<NudgeStudentResponseDto> {
    return this.commandBus.execute(new NudgeStudentCommand(user.sub, schoolId, userId));
  }
}
