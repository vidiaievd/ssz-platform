import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
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
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { PlatformAdminGuard } from '../../../../common/guards/platform-admin.guard.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
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
  TestModelResponseDto,
} from '../dto/registry.dto.js';

@ApiTags('Admin — model registry')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
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

  @Post('models/:id/test')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Make one short structured call to the model',
    description:
      'Checks the key, the model id and structured output in one go. Runs on a disabled provider ' +
      '(that is what it is for) but not on an unconfigured one. A failed call is a 200 with ' +
      '`outcome: "error"` — the test ran, the failure is its answer. Each test is a ledger row ' +
      '(capability diagnostic, payer platform).',
  })
  @ApiOkResponse({ type: TestModelResponseDto })
  @ApiNotFoundResponse({ description: 'No such model' })
  @ApiUnprocessableEntityResponse({ description: 'Provider not configured, or no adapter for its kind yet' })
  testModel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<TestModelResult> {
    return this.commandBus.execute(new TestModelCommand(id, user.userId, 'platform_admin'));
  }
}
