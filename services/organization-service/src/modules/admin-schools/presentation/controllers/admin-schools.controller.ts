import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminLevel } from '@ssz/contracts';
import { RequireAdminLevel } from '../../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../../common/guards/admin-level.guard.js';
import {
  ADMIN_SCHOOL_SORT_DEFAULT,
  ADMIN_SCHOOLS_PAGE_DEFAULT,
  type AdminSchoolDetail,
  type AdminSchoolPage,
} from '../../domain/admin-school.js';
import {
  ADMIN_MEMBERS_PAGE_DEFAULT,
  type AdminMemberPage,
  type AdminSchoolSettings,
} from '../../domain/admin-school-roster.js';
import { GetAdminSchoolQuery } from '../../application/queries/get-admin-school.query.js';
import { GetAdminSchoolSettingsQuery } from '../../application/queries/get-admin-school-settings.query.js';
import { ListAdminSchoolMembersQuery } from '../../application/queries/list-admin-school-members.query.js';
import { ListAdminSchoolsQuery } from '../../application/queries/list-admin-schools.query.js';
import { AdminSchoolDetailDto, AdminSchoolPageDto, ListAdminSchoolsQueryDto } from '../dto/admin-schools.dto.js';
import {
  AdminMemberPageDto,
  AdminSchoolSettingsDto,
  ListAdminSchoolMembersQueryDto,
} from '../dto/admin-school-roster.dto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Schools as the platform admin sees them (plan 90, phase 1 step 7; roster and settings — phase 3 step 5). Read only. */
@ApiTags('Admin — schools')
@ApiBearerAuth('JWT')
@UseGuards(AdminLevelGuard)
@RequireAdminLevel(AdminLevel.SUPPORT)
@ApiUnauthorizedResponse({ description: 'No or invalid token' })
@ApiForbiddenResponse({ description: 'Not platform_admin, or a token without an admin level (`ADMIN_LEVEL_REQUIRED`)' })
@Controller('admin/schools')
export class AdminSchoolsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'Every school and SOLO workspace, a page at a time',
    description:
      'Filters combine with AND; no `status` returns soft-deleted rows too. Counts are roster rows (active ' +
      'students, teachers); the owner is in none of them. Admin-panel token, level `support` or higher.',
  })
  @ApiOkResponse({ type: AdminSchoolPageDto })
  @ApiBadRequestResponse({ description: 'Unknown kind, status, seats or sort; page or limit out of range' })
  list(@Query() query: ListAdminSchoolsQueryDto): Promise<AdminSchoolPage> {
    return this.queryBus.execute(
      new ListAdminSchoolsQuery(
        { search: query.search, kind: query.kind, status: query.status, seats: query.seats },
        query.sort ?? ADMIN_SCHOOL_SORT_DEFAULT,
        query.page ?? 1,
        query.limit ?? ADMIN_SCHOOLS_PAGE_DEFAULT,
      ),
    );
  }

  @Get(':schoolId')
  @ApiOperation({
    summary: "A school's card: contacts, owner, head counts, groups, courses",
    description: 'Soft-deleted schools are found too (status `deleted`). Admin-panel token, level `support` or higher.',
  })
  @ApiOkResponse({ type: AdminSchoolDetailDto })
  @ApiNotFoundResponse({ description: 'No school with this id' })
  async get(@Param('schoolId') schoolId: string): Promise<AdminSchoolDetail> {
    const school = UUID.test(schoolId)
      ? await this.queryBus.execute<GetAdminSchoolQuery, AdminSchoolDetail | null>(new GetAdminSchoolQuery(schoolId))
      : null;
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  @Get(':schoolId/members')
  @ApiOperation({
    summary: "A school's roster: name, role, groups, status, joined",
    description:
      'Newest first. No email and no learning activity. The owner is not a roster row — take it from the card. ' +
      '`name` is null until profile-service synced it. Admin-panel token, level `support` or higher.',
  })
  @ApiOkResponse({ type: AdminMemberPageDto })
  @ApiBadRequestResponse({ description: 'Unknown role or status; groupId not a UUID; page or limit out of range' })
  @ApiNotFoundResponse({ description: 'No school with this id' })
  async members(
    @Param('schoolId') schoolId: string,
    @Query() query: ListAdminSchoolMembersQueryDto,
  ): Promise<AdminMemberPage> {
    const page = UUID.test(schoolId)
      ? await this.queryBus.execute<ListAdminSchoolMembersQuery, AdminMemberPage | null>(
          new ListAdminSchoolMembersQuery(
            schoolId,
            { role: query.role, status: query.status, groupId: query.groupId },
            query.page ?? 1,
            query.limit ?? ADMIN_MEMBERS_PAGE_DEFAULT,
          ),
        )
      : null;
    if (!page) throw new NotFoundException('School not found');
    return page;
  }

  @Get(':schoolId/settings')
  @ApiOperation({
    summary: "A school's review and AI settings in one answer",
    description:
      'Response time, review policy, assistant access, pre-hand-in check — as saved; whether the plan still allows ' +
      'them is subscription-service’s and ai-service’s answer. Admin-panel token, level `support` or higher.',
  })
  @ApiOkResponse({ type: AdminSchoolSettingsDto })
  @ApiNotFoundResponse({ description: 'No school with this id' })
  async settings(@Param('schoolId') schoolId: string): Promise<AdminSchoolSettings> {
    const settings = UUID.test(schoolId)
      ? await this.queryBus.execute<GetAdminSchoolSettingsQuery, AdminSchoolSettings | null>(
          new GetAdminSchoolSettingsQuery(schoolId),
        )
      : null;
    if (!settings) throw new NotFoundException('School not found');
    return settings;
  }
}
