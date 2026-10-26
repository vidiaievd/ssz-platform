import { Inject, NotFoundException } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { findCapability } from '../../../../capabilities/catalog.js';
import { capabilityModality } from '../../../../capabilities/domain/capability.js';
import { BINDING_REPOSITORY, type IBindingRepository } from '../../ports/binding.repository.js';
import type { CapabilityBinding } from '../list-bindings/list-bindings.handler.js';
import { GetBindingQuery } from './get-binding.query.js';

@QueryHandler(GetBindingQuery)
export class GetBindingHandler implements IQueryHandler<GetBindingQuery, CapabilityBinding> {
  constructor(@Inject(BINDING_REPOSITORY) private readonly bindings: IBindingRepository) {}

  async execute(query: GetBindingQuery): Promise<CapabilityBinding> {
    const capability = findCapability(query.capability);
    if (!capability) throw new NotFoundException(`Unknown capability "${query.capability}"`);
    return {
      capability: capability.code,
      description: capability.description,
      modality: capabilityModality(capability),
      requiredFeatures: capability.requiredFeatures,
      binding: await this.bindings.get(capability.code),
    };
  }
}
