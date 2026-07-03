import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCanDoDescriptorsByIdsQuery } from './get-descriptors-by-ids.query.js';
import {
  CAN_DO_DESCRIPTOR_REPOSITORY,
  type ICanDoDescriptorRepository,
} from '../../../domain/repositories/can-do-descriptor.repository.interface.js';
import type { CanDoDescriptorEntity } from '../../../domain/entities/can-do-descriptor.entity.js';

@QueryHandler(GetCanDoDescriptorsByIdsQuery)
export class GetCanDoDescriptorsByIdsHandler
  implements IQueryHandler<GetCanDoDescriptorsByIdsQuery, CanDoDescriptorEntity[]>
{
  constructor(
    @Inject(CAN_DO_DESCRIPTOR_REPOSITORY)
    private readonly repo: ICanDoDescriptorRepository,
  ) {}

  execute(query: GetCanDoDescriptorsByIdsQuery): Promise<CanDoDescriptorEntity[]> {
    return this.repo.findByIds(query.ids);
  }
}
