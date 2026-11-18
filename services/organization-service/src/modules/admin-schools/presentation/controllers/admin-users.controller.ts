import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
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
import type { AdminUserSchools } from '../../domain/admin-user-schools.js';
import { GetAdminUserSchoolsQuery } from '../../application/queries/get-admin-user-schools.query.js';
import { AdminUserSchoolsDto } from '../dto/admin-user-schools.dto.js';

/** Any UUID version: seeded users are uuidv5. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A user's side of schools for the admin panel's user card (plan 90, phase 6, step 4). Read only. */
@ApiTags('Admin — users')
@ApiBearerAuth('JWT')
@UseGuards(AdminLevelGuard)
@RequireAdminLevel(AdminLevel.SUPPORT)
@ApiUnauthorizedResponse({ description: 'No or invalid token' })
@ApiForbiddenResponse({ description: 'Not platform_admin, or a token without an admin level (`ADMIN_LEVEL_REQUIRED`)' })
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':userId/schools')
  @ApiOperation({
    summary: 'Schools a user owns and the rosters the user is on',
    description:
      'Closed schools are listed, purged ones are not. Organization does not know users: an id it never saw answers ' +
      'two empty lists, not 404. Admin-panel token, level `support` or higher.',
  })
  @ApiOkResponse({ type: AdminUserSchoolsDto })
  @ApiNotFoundResponse({ description: 'The id is not a UUID' })
  async schools(@Param('userId') userId: string): Promise<AdminUserSchools> {
    if (!UUID.test(userId)) throw new NotFoundException('User not found');
    return this.queryBus.execute<GetAdminUserSchoolsQuery, AdminUserSchools>(new GetAdminUserSchoolsQuery(userId));
  }
}
