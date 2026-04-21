import { Injectable, Logger } from '@nestjs/common';
import { TaggableEntityType } from '../../domain/types/taggable-entity-type.js';
import type { AccessibleEntity } from '../../domain/types/accessible-entity.js';
import type { EntityResolverFn } from '../../domain/ports/entity-resolver.port.js';

@Injectable()
export class EntityResolverRegistry {
  private readonly logger = new Logger(EntityResolverRegistry.name);
  private readonly resolvers = new Map<TaggableEntityType, EntityResolverFn>();

  register(type: TaggableEntityType, fn: EntityResolverFn): void {
    if (this.resolvers.has(type)) {
      throw new Error(`EntityResolverRegistry: resolver for '${type}' is already registered`);
    }
    this.resolvers.set(type, fn);
    this.logger.debug(`Registered resolver for entity type '${type}'`);
  }

  async resolve(type: TaggableEntityType, id: string): Promise<AccessibleEntity | null> {
    const fn = this.resolvers.get(type);
    if (!fn) {
      this.logger.warn(`No resolver registered for entity type '${type}'`);
      return null;
    }
    return fn(id);
  }
}
