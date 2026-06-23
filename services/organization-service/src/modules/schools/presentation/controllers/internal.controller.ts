import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { GetSchoolQuery } from '../../application/queries/get-school/get-school.query.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../domain/repositories/school-group.repository.interface.js';
import type { SchoolDto } from '../../application/dto/school.dto.js';

interface MemberRoleResponse {
  schoolId: string;
  userId: string;
  role: string;
}

interface BatchMemberRoleResponse {
  results: MemberRoleResponse[];
}

@ApiExcludeController()
@Public()
@Controller('internal/schools')
export class InternalController {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(SCHOOL_GROUP_REPOSITORY)
    private readonly groupRepository: ISchoolGroupRepository,
  ) {}

  /**
   * Returns the school role of a specific user within a specific school.
   * Used by Content Service for permission checks.
   * Returns 404 if the user is not a member.
   */
  @Get(':schoolId/members/:userId/role')
  async getMemberRole(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<MemberRoleResponse> {
    // Load school using system context (no actor restriction for internal calls)
    const school: SchoolDto = await this.queryBus.execute(
      new GetSchoolQuery(schoolId, userId),
    );

    const member = school.members.find((m) => m.userId === userId);
    if (!member) {
      throw new NotFoundException(`User ${userId} is not a member of school ${schoolId}`);
    }

    // Also owner has implicit access — report as OWNER if no member record
    const role = member?.role ?? (school.ownerId === userId ? 'OWNER' : null);
    if (!role) {
      throw new NotFoundException(`User ${userId} is not a member of school ${schoolId}`);
    }

    return { schoolId, userId, role };
  }

  /**
   * Returns all member userIds in a school group.
   * Used by Learning Service for bulk group assignment creation.
   */
  @Get(':schoolId/groups/:groupId/members')
  async getGroupMembers(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<{ userIds: string[] }> {
    const group = await this.groupRepository.findById(groupId);
    if (!group || group.isDeleted || group.schoolId !== schoolId) {
      throw new NotFoundException(`Group ${groupId} not found in school ${schoolId}`);
    }
    return { userIds: group.memberUserIds };
  }

  /**
   * Returns a group's scheduling-relevant fields.
   * Used by Scheduling Service to verify group/school ownership and term dates.
   */
  @Get(':schoolId/groups/:groupId')
  async getGroup(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<{
    id: string;
    schoolId: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    lang: string | null;
  }> {
    const group = await this.groupRepository.findById(groupId);
    if (!group || group.isDeleted || group.schoolId !== schoolId) {
      throw new NotFoundException(`Group ${groupId} not found in school ${schoolId}`);
    }
    return {
      id: group.id,
      schoolId: group.schoolId,
      name: group.name,
      startDate: group.startDate?.toISOString() ?? null,
      endDate: group.endDate?.toISOString() ?? null,
      status: group.status,
      lang: group.lang ?? null,
    };
  }

  /**
   * Returns a group's assigned teachers (primary/co-primary/substitute).
   * Used by Scheduling Service to find the primary teacher for lesson generation.
   */
  @Get(':schoolId/groups/:groupId/teachers')
  async getGroupTeachers(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<Array<{ userId: string; role: string; fromDate: string | null; toDate: string | null }>> {
    const group = await this.groupRepository.findById(groupId);
    if (!group || group.isDeleted || group.schoolId !== schoolId) {
      throw new NotFoundException(`Group ${groupId} not found in school ${schoolId}`);
    }
    return group.teachers.map((t) => ({
      userId: t.userId,
      role: t.role,
      fromDate: t.fromDate?.toISOString() ?? null,
      toDate: t.toDate?.toISOString() ?? null,
    }));
  }

  /**
   * Batch lookup of school roles for multiple (schoolId, userId) pairs.
   * Query: ?schoolIds=id1,id2&userId=id
   * Returns only found memberships — missing pairs are omitted.
   */
  @Get('members-batch')
  async getMemberRolesBatch(
    @Query('userId') userId: string,
    @Query('schoolIds') schoolIds: string,
  ): Promise<BatchMemberRoleResponse> {
    const ids = schoolIds ? schoolIds.split(',').filter(Boolean) : [];
    const results: MemberRoleResponse[] = [];

    for (const schoolId of ids) {
      try {
        const school: SchoolDto = await this.queryBus.execute(
          new GetSchoolQuery(schoolId, userId),
        );
        const member = school.members.find((m) => m.userId === userId);
        const role = member?.role ?? (school.ownerId === userId ? 'OWNER' : null);
        if (role) results.push({ schoolId, userId, role });
      } catch {
        // School not found or user not a member — skip
      }
    }

    return { results };
  }
}
