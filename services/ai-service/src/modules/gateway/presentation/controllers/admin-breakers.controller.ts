import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator.js';
import { RequireAdminLevel } from '../../../../common/decorators/require-admin-level.decorator.js';
import { AdminReasonDto } from '../../../../common/dto/admin-reason.js';
import { AdminLevelGuard } from '../../../../common/guards/admin-level.guard.js';
import type { AdminActor } from '../../../../shared/application/admin-audit.js';
import { ResetBreakerCommand } from '../../application/commands/reset-breaker/reset-breaker.command.js';
import type { ResetBreakerResult } from '../../application/commands/reset-breaker/reset-breaker.handler.js';
import type { BreakerBoardView } from '../../application/queries/list-breakers/list-breakers.handler.js';
import { ListBreakersQuery } from '../../application/queries/list-breakers/list-breakers.query.js';
import { BreakerBoardDto, ResetBreakerResponseDto } from '../dto/breaker.dto.js';

@ApiTags('Admin — model registry')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: "Caller is not platform_admin of the route's admin level (admin-panel session)" })
@UseGuards(AdminLevelGuard)
@RequireAdminLevel('support')
@Controller('admin/ai/breakers')
export class AdminBreakersController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Every model's circuit breaker",
    description:
      'Per registry model: open / closed / unknown, when it reopens, failures counted in the window, its provider ' +
      'and the bindings that call it; plus the thresholds. Open breakers first. Read live from Redis on each call.',
  })
  @ApiOkResponse({ type: BreakerBoardDto })
  list(): Promise<BreakerBoardView> {
    return this.queryBus.execute(new ListBreakersQuery());
  }

  @RequireAdminLevel('admin')
  @Post(':modelId/reset')
  @HttpCode(200)
  @ApiOperation({
    summary: "Close a model's breaker by hand",
    description:
      'Closes it and clears the failure count, so the next call goes to the model again. `reason` is required; ' +
      'the reset goes to the admin trail as `breaker.reset`. A closed breaker with no failures counted is left ' +
      'alone (`changed: false`, nothing on the trail).',
  })
  @ApiOkResponse({ type: ResetBreakerResponseDto })
  @ApiNotFoundResponse({ description: 'No such model' })
  @ApiServiceUnavailableResponse({ description: 'The breaker store (Redis) is not available: `breaker_store_unavailable`' })
  reset(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() body: AdminReasonDto,
    @CurrentAdmin() admin: AdminActor,
  ): Promise<ResetBreakerResult> {
    return this.commandBus.execute(new ResetBreakerCommand(modelId, admin, body.reason));
  }
}
