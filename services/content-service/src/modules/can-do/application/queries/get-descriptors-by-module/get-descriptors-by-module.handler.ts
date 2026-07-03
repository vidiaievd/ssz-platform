import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCanDoDescriptorsByModuleQuery } from './get-descriptors-by-module.query.js';
import {
  CAN_DO_DESCRIPTOR_REPOSITORY,
  type ICanDoDescriptorRepository,
} from '../../../domain/repositories/can-do-descriptor.repository.interface.js';
import type { CanDoDescriptorEntity } from '../../../domain/entities/can-do-descriptor.entity.js';

@QueryHandler(GetCanDoDescriptorsByModuleQuery)
export class GetCanDoDescriptorsByModuleHandler
  implements IQueryHandler<GetCanDoDescriptorsByModuleQuery, CanDoDescriptorEntity[]>
{
  constructor(
    @Inject(CAN_DO_DESCRIPTOR_REPOSITORY)
    private readonly repo: ICanDoDescriptorRepository,
  ) {}

  execute(query: GetCanDoDescriptorsByModuleQuery): Promise<CanDoDescriptorEntity[]> {
    return this.repo.findByModuleId(query.moduleContainerId);
  }
}
