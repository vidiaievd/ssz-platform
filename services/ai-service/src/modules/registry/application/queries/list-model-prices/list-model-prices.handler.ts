import { Inject, NotFoundException } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { AiModelPrice } from '../../../domain/registry.types.js';
import { REGISTRY_READER, type IRegistryReader } from '../../ports/registry.reader.js';
import { ListModelPricesQuery } from './list-model-prices.query.js';

@QueryHandler(ListModelPricesQuery)
export class ListModelPricesHandler implements IQueryHandler<ListModelPricesQuery, AiModelPrice[]> {
  constructor(@Inject(REGISTRY_READER) private readonly registry: IRegistryReader) {}

  async execute(query: ListModelPricesQuery): Promise<AiModelPrice[]> {
    const prices = await this.registry.listPrices(query.modelId);
    if (!prices) throw new NotFoundException(`Model ${query.modelId} not found`);
    return prices;
  }
}
