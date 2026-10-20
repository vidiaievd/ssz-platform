import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { REGISTRY_READER, type IRegistryReader, type ModelWithCurrentPrice } from '../../ports/registry.reader.js';
import { ListModelsQuery } from './list-models.query.js';

@QueryHandler(ListModelsQuery)
export class ListModelsHandler implements IQueryHandler<ListModelsQuery, ModelWithCurrentPrice[]> {
  constructor(@Inject(REGISTRY_READER) private readonly registry: IRegistryReader) {}

  execute(query: ListModelsQuery): Promise<ModelWithCurrentPrice[]> {
    return this.registry.listModels({ providerId: query.providerId }, new Date());
  }
}
