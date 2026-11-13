import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminLevel } from '@ssz/contracts';
import { RequireAdminLevel } from '../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../common/guards/admin-level.guard.js';
import { ADMIN_AUDIT_PAGE_DEFAULT, decodeCursor } from '../domain/admin-audit.js';
import { AdminAuditPageDto, ListAdminAuditQueryDto } from '../dto/admin-audit.dto.js';
import { ListAdminAuditQuery } from '../queries/list-admin-audit.query.js';

/** The platform admins' trail across services, for the admin panel (plan 90, phase 1, step 6). */
@ApiTags('Admin audit')
@ApiBearerAuth()
@UseGuards(AdminLevelGuard)
@RequireAdminLevel(AdminLevel.SUPPORT)
@Controller('admin/audit')
export class AdminAuditController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'What platform admins changed, newest first',
    description:
      'Collected from `admin.action.performed` of every service that writes an admin trail (auth, subscription). ' +
      'Filters combine with AND; `from` is inclusive, `to` exclusive. Admin-panel token, level `support` or higher.',
  })
  @ApiOkResponse({ type: AdminAuditPageDto })
  @ApiBadRequestResponse({ description: 'Unknown filter, bad date, `from` after `to`, or a cursor this service did not issue' })
  @ApiUnauthorizedResponse({ description: 'No or invalid token' })
  @ApiForbiddenResponse({ description: 'Not platform_admin, or a token without an admin level (`ADMIN_LEVEL_REQUIRED`)' })
  async list(@Query() query: ListAdminAuditQueryDto): Promise<AdminAuditPageDto> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) throw new BadRequestException('`from` must not be after `to`');

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new BadRequestException('Invalid cursor');

    return this.queryBus.execute(
      new ListAdminAuditQuery(
        {
          service: query.service,
          actorId: query.actorId,
          targetType: query.targetType,
          targetId: query.targetId,
          from,
          to,
        },
        cursor,
        query.limit ?? ADMIN_AUDIT_PAGE_DEFAULT,
      ),
    );
  }
}
