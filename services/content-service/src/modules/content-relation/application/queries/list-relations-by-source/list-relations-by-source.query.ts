import { RelatableEntityType } from '../../../domain/types/relatable-entity-type.js';
import { RelationKind } from '../../../domain/types/relation-kind.js';

export class ListRelationsBySourceQuery {
  constructor(
    public readonly sourceType: RelatableEntityType,
    public readonly sourceId: string,
    public readonly relationKind?: RelationKind,
  ) {}
}
