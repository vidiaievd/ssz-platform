import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator.js';
import { RequireAdminLevel } from '../../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../../common/guards/admin-level.guard.js';
import type { AdminActor } from '../../../../shared/application/admin-audit.js';
import { SetModelStatusCommand } from '../../application/commands/set-model-status/set-model-status.command.js';
import type { SetModelStatusResult } from '../../application/commands/set-model-status/set-model-status.handler.js';
import { SetProviderEnabledCommand } from '../../application/commands/set-provider-enabled/set-provider-enabled.command.js';
import type { SetProviderEnabledResult } from '../../application/commands/set-provider-enabled/set-provider-enabled.handler.js';
import { TestModelCommand } from '../../application/commands/test-model/test-model.command.js';
import type { TestModelResult } from '../../application/commands/test-model/test-model.handler.js';
import type { ModelWithCurrentPrice } from '../../application/ports/registry.reader.js';
import { ListModelPricesQuery } from '../../application/queries/list-model-prices/list-model-prices.query.js';
import { ListModelsQuery } from '../../application/queries/list-models/list-models.query.js';
import type { ProviderListItem } from '../../application/queries/list-providers/list-providers.handler.js';
import { ListProvidersQuery } from '../../application/queries/list-providers/list-providers.query.js';
import type { AiModelPrice } from '../../domain/registry.types.js';
import {
  ListModelsQueryDto,
  ModelPriceResponseDto,
  ModelResponseDto,
  ProviderResponseDto,
  SetModelStatusDto,
  SetModelStatusResponseDto,
  SetProviderEnabledDto,
  SetProviderEnabledResponseDto,
  TestModelDto,
  TestModelResponseDto,
} from '../dto/registry.dto.js';

@ApiTags('Admin — model registry')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin of the route\'s admin level (admin-panel session)' })
@UseGuards(AdminLevelGuard)
@RequireAdminLevel('support')
@Controller('admin/ai')
export class AdminRegistryController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('providers')
  @ApiOperation({ summary: 'List providers, with whether each is configured in this environment' })
  @ApiOkResponse({ type: [ProviderResponseDto] })
  listProviders(): Promise<ProviderListItem[]> {
    return this.queryBus.execute(new ListProvidersQuery());
  }

  @RequireAdminLevel('super')
  @Put('providers/:id')
  @ApiOperation({
    summary: "Switch a provider on or off",
    description:
      'Off: the router steps over every model of the provider to the binding\'s fallback; a binding with nothing ' +
      'else left answers `unavailable` — the answer lists those (`strandedCapabilities`). Takes effect on the next ' +
      'call. On: only when the provider is configured, else 422 with `missing`. `reason` is required; a flip goes ' +
      'to the admin trail as `provider.toggled`; asking for the state it already has writes nothing (`changed: false`).',
  })
  @ApiOkResponse({ type: SetProviderEnabledResponseDto })
  @ApiNotFoundResponse({ description: 'No such provider' })
  @ApiUnprocessableEntityResponse({ description: 'Switching on a provider that is not configured; `missing` lists why' })
  setProviderEnabled(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetProviderEnabledDto,
    @CurrentAdmin() admin: AdminActor,
  ): Promise<SetProviderEnabledResult> {
    return this.commandBus.execute(new SetProviderEnabledCommand(id, body.enabled, admin, body.reason));
  }

  @Get('models')
  @ApiOperation({ summary: 'List models with the price in effect now' })
  @ApiOkResponse({ type: [ModelResponseDto] })
  listModels(@Query() query: ListModelsQueryDto): Promise<ModelWithCurrentPrice[]> {
    return this.queryBus.execute(new ListModelsQuery(query.providerId));
  }

  @Get('models/:id/prices')
  @ApiOperation({ summary: "A model's price history, newest first" })
  @ApiOkResponse({ type: [ModelPriceResponseDto] })
  @ApiNotFoundResponse({ description: 'No such model' })
  listPrices(@Param('id', ParseUUIDPipe) id: string): Promise<AiModelPrice[]> {
    return this.queryBus.execute(new ListModelPricesQuery(id));
  }

  @RequireAdminLevel('super')
  @Put('models/:id/status')
  @ApiOperation({
    summary: "Change a model's status",
    description:
      '`disabled` takes the model out of every binding at once (the router steps to the fallback) and new bindings ' +
      'refuse it; `deprecated` is a label, the model still serves; `active` brings it back. The answer lists ' +
      'bindings left with no model that serves (`strandedCapabilities`). `reason` is required; a change goes to the ' +
      'admin trail as `model.status_changed`; the same status writes nothing (`changed: false`).',
  })
  @ApiOkResponse({ type: SetModelStatusResponseDto })
  @ApiNotFoundResponse({ description: 'No such model' })
  setModelStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetModelStatusDto,
    @CurrentAdmin() admin: AdminActor,
  ): Promise<SetModelStatusResult> {
    return this.commandBus.execute(new SetModelStatusCommand(id, body.status, admin, body.reason));
  }

  @RequireAdminLevel('admin')
  @Post('models/:id/test')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Make one short structured call to the model',
    description:
      'Checks the key, the model id and structured output in one go. Runs on a disabled provider ' +
      '(that is what it is for) but not on an unconfigured one. A failed call is a 200 with ' +
      '`outcome: "error"` — the test ran, the failure is its answer. Each test is a ledger row ' +
      '(capability diagnostic, payer platform) and an admin trail entry `model.tested` (body `{ reason? }`, ' +
      'reason optional). Language models only: a speech model is a 422.',
  })
  @ApiOkResponse({ type: TestModelResponseDto })
  @ApiNotFoundResponse({ description: 'No such model' })
  @ApiUnprocessableEntityResponse({ description: 'Provider not configured, no adapter for its kind yet, or a speech model' })
  testModel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TestModelDto | undefined,
    @CurrentAdmin() admin: AdminActor,
  ): Promise<TestModelResult> {
    const reason = body?.reason?.trim() || null;
    return this.commandBus.execute(new TestModelCommand(id, admin, reason));
  }
}
