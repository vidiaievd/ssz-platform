import { Inject, NotFoundException } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { findCapability } from '../../../../capabilities/catalog.js';
import type { BindingChange } from '../../../domain/binding.js';
import { BINDING_REPOSITORY, type IBindingRepository } from '../../ports/binding.repository.js';
import { GetBindingHistoryQuery } from './get-binding-history.query.js';

@QueryHandler(GetBindingHistoryQuery)
export class GetBindingHistoryHandler implements IQueryHandler<GetBindingHistoryQuery, BindingChange[]> {
  constructor(@Inject(BINDING_REPOSITORY) private readonly bindings: IBindingRepository) {}

  async execute(query: GetBindingHistoryQuery): Promise<BindingChange[]> {
    if (!findCapability(query.capability)) throw new NotFoundException(`Unknown capability "${query.capability}"`);
    return this.bindings.history(query.capability);
  }
}
