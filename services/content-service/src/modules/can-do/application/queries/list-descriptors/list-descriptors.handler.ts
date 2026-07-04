import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListCanDoDescriptorsQuery } from './list-descriptors.query.js';
import {
  CAN_DO_DESCRIPTOR_REPOSITORY,
  type ICanDoDescriptorRepository,
} from '../../../domain/repositories/can-do-descriptor.repository.interface.js';
import type { CanDoDescriptorEntity } from '../../../domain/entities/can-do-descriptor.entity.js';

@QueryHandler(ListCanDoDescriptorsQuery)
export class ListCanDoDescriptorsHandler
  implements IQueryHandler<ListCanDoDescriptorsQuery, CanDoDescriptorEntity[]>
{
  constructor(
    @Inject(CAN_DO_DESCRIPTOR_REPOSITORY)
    private readonly repo: ICanDoDescriptorRepository,
  ) {}

  execute(query: ListCanDoDescriptorsQuery): Promise<CanDoDescriptorEntity[]> {
    return this.repo.findAll({
      scope: query.scope,
      ownerSchoolId: query.ownerSchoolId,
      cefrLevel: query.cefrLevel,
      skill: query.skill,
    });
  }
}
