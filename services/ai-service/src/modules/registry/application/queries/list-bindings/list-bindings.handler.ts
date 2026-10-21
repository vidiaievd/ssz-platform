import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { CAPABILITIES } from '../../../../capabilities/catalog.js';
import type { RequiredFeatures } from '../../../../capabilities/domain/capability.js';
import type { AiBinding } from '../../../domain/binding.js';
import { BINDING_REPOSITORY, type IBindingRepository } from '../../ports/binding.repository.js';
import { ListBindingsQuery } from './list-bindings.query.js';

export interface CapabilityBinding {
  capability: string;
  description: string;
  requiredFeatures: RequiredFeatures;
  /** Null until an admin binds the capability — every call to it is refused until then. */
  binding: AiBinding | null;
}

/** Every known capability, bound or not, so an unbound agent is visible rather than absent. */
@QueryHandler(ListBindingsQuery)
export class ListBindingsHandler implements IQueryHandler<ListBindingsQuery, CapabilityBinding[]> {
  constructor(@Inject(BINDING_REPOSITORY) private readonly bindings: IBindingRepository) {}

  async execute(): Promise<CapabilityBinding[]> {
    const byCode = new Map((await this.bindings.list()).map((b) => [b.capability, b]));
    return CAPABILITIES.map((c) => ({
      capability: c.code,
      description: c.description,
      requiredFeatures: c.requiredFeatures,
      binding: byCode.get(c.code) ?? null,
    }));
  }
}
