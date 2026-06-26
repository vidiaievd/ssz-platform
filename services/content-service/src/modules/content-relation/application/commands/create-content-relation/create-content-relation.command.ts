import { RelatableEntityType } from '../../../domain/types/relatable-entity-type.js';
import { RelationKind } from '../../../domain/types/relation-kind.js';

export class CreateContentRelationCommand {
  constructor(
    public readonly sourceType: RelatableEntityType,
    public readonly sourceId: string,
    public readonly relationKind: RelationKind,
    public readonly targetType: RelatableEntityType,
    public readonly targetId: string,
    public readonly ownerSchoolId: string | null,
    public readonly createdByUserId: string,
  ) {}
}
