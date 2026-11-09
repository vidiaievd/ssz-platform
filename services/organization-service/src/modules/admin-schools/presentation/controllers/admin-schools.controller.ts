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
import { GetAdminSchoolQuery } from '../../application/queries/get-admin-school.query.js';
import { ListAdminSchoolsQuery } from '../../application/queries/list-admin-schools.query.js';
import { AdminSchoolDetailDto, AdminSchoolPageDto, ListAdminSchoolsQueryDto } from '../dto/admin-schools.dto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Schools as the platform admin sees them (plan 90, phase 1, step 7). Read only. */
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
  @ApiBadRequestResponse({ description: 'Unknown kind, status or sort; page or limit out of range' })
  list(@Query() query: ListAdminSchoolsQueryDto): Promise<AdminSchoolPage> {
    return this.queryBus.execute(
      new ListAdminSchoolsQuery(
        { search: query.search, kind: query.kind, status: query.status },
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
}
