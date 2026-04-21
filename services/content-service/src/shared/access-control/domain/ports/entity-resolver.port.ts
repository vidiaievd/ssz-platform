import type { AccessibleEntity } from '../types/accessible-entity.js';

/** Resolves an entity (including soft-deleted) by id for access control checks. */
export type EntityResolverFn = (id: string) => Promise<AccessibleEntity | null>;
