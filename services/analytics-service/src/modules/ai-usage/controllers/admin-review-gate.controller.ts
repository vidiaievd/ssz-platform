import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminLevel } from '@ssz/contracts';
import { parseOptionalDayRange } from '../../../common/day-range.js';
import { RequireAdminLevel } from '../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../common/guards/admin-level.guard.js';
import { ReviewGateDto } from '../dto/review-gate.dto.js';
import { GetReviewGateQuery } from '../queries/get-review-gate.query.js';

/**
 * The Q2 gate of plan 79 for the platform admin panel (plan 90, phase 7, step 10). The path sits
 * under `admin/ai`, which the gateway sends to ai-service — this one exact path goes here
 * instead (`location = /api/v1/admin/ai/review-gate`), so anything under it stays ai-service's.
 */
@ApiTags('Admin AI review gate')
@ApiBearerAuth()
@UseGuards(AdminLevelGuard)
@RequireAdminLevel(AdminLevel.SUPPORT)
@Controller('admin/ai/review-gate')
export class AdminReviewGateController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'Review quality per exercise template × model, against the Q2 gate',
    description:
      "Teachers' settled drafts and the share of remarks kept / thrown out, folded over every agent and prompt " +
      'version, with the thresholds from configuration and the verdict by them. Which model is bound to ' +
      '`review_direct` comes from ai-service `GET admin/ai/bindings`. Rows folded before the template was ' +
      'recorded come as `templateCode: null`. Admin-panel token, level `support` or higher.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'First UTC day, inclusive (YYYY-MM-DD); omitted = all time' })
  @ApiQuery({ name: 'to', required: false, description: 'Last UTC day, inclusive (YYYY-MM-DD); omitted = all time' })
  @ApiOkResponse({ type: ReviewGateDto })
  @ApiBadRequestResponse({ description: 'Not a calendar day, or `from` after `to`' })
  @ApiUnauthorizedResponse({ description: 'No or invalid token' })
  @ApiForbiddenResponse({ description: 'Not platform_admin, or a token without an admin level (`ADMIN_LEVEL_REQUIRED`)' })
  async gate(@Query('from') from?: string, @Query('to') to?: string): Promise<ReviewGateDto> {
    const range = parseOptionalDayRange(from, to);
    return this.queryBus.execute(new GetReviewGateQuery(range.from, range.to));
  }
}
