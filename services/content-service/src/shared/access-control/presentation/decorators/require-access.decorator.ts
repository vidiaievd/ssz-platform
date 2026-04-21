import { SetMetadata } from '@nestjs/common';
import type { AccessAction } from '../../domain/types/access-action.js';
import type { TaggableEntityType } from '../../domain/types/taggable-entity-type.js';

export const ACCESS_REQUIREMENT_KEY = 'ACCESS_REQUIREMENT';

export type RequireAccessOptions =
  | { entityType: TaggableEntityType; idParam?: string }
  | { entityTypeParam: string; idParam: string };

export interface AccessRequirement {
  action: AccessAction;
  options: RequireAccessOptions;
}

export const RequireAccess = (action: AccessAction, options: RequireAccessOptions) =>
  SetMetadata<string, AccessRequirement>(ACCESS_REQUIREMENT_KEY, { action, options });
