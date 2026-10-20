import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
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
import { PlatformAdminGuard } from '../../../../common/guards/platform-admin.guard.js';
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
} from '../dto/registry.dto.js';

@ApiTags('Admin — model registry')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
@Controller('admin/ai')
export class AdminRegistryController {
  constructor(private readonly queryBus: QueryBus) {}

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
}
