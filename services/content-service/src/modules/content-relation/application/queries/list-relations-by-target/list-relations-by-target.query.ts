import { RelatableEntityType } from '../../../domain/types/relatable-entity-type.js';
import { RelationKind } from '../../../domain/types/relation-kind.js';

export class ListRelationsByTargetQuery {
  constructor(
    public readonly targetType: RelatableEntityType,
    public readonly targetId: string,
    public readonly relationKind?: RelationKind,
  ) {}
}
