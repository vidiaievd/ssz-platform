import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { GetSchoolQuery } from '../../application/queries/get-school/get-school.query.js';
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
  constructor(private readonly queryBus: QueryBus) {}

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
