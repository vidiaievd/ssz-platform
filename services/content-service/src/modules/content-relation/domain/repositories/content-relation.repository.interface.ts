import { ContentRelationEntity } from '../entities/content-relation.entity.js';
import { RelatableEntityType } from '../types/relatable-entity-type.js';
import { RelationKind } from '../types/relation-kind.js';

export const CONTENT_RELATION_REPOSITORY = Symbol('IContentRelationRepository');

export interface IContentRelationRepository {
  findById(id: string): Promise<ContentRelationEntity | null>;
  findBySource(
    sourceType: RelatableEntityType,
    sourceId: string,
    relationKind?: RelationKind,
  ): Promise<ContentRelationEntity[]>;
  findByTarget(
    targetType: RelatableEntityType,
    targetId: string,
    relationKind?: RelationKind,
  ): Promise<ContentRelationEntity[]>;
  findExact(
    sourceType: RelatableEntityType,
    sourceId: string,
    relationKind: RelationKind,
    targetType: RelatableEntityType,
    targetId: string,
  ): Promise<ContentRelationEntity | null>;
  save(entity: ContentRelationEntity): Promise<ContentRelationEntity>;
  delete(id: string): Promise<void>;
}
