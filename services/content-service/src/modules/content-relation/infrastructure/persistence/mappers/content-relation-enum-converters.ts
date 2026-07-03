import { $Enums } from '../../../../../../generated/prisma/client.js';
import { RelatableEntityType } from '../../../domain/types/relatable-entity-type.js';
import { RelationKind } from '../../../domain/types/relation-kind.js';

const PRISMA_TO_DOMAIN_ENTITY_TYPE: Record<$Enums.RelatableEntityType, RelatableEntityType> = {
  CONTAINER: RelatableEntityType.CONTAINER,
  LESSON: RelatableEntityType.LESSON,
  VOCABULARY_LIST: RelatableEntityType.VOCABULARY_LIST,
  VOCABULARY_ITEM: RelatableEntityType.VOCABULARY_ITEM,
  GRAMMAR_RULE: RelatableEntityType.GRAMMAR_RULE,
  EXERCISE: RelatableEntityType.EXERCISE,
  CAN_DO_DESCRIPTOR: RelatableEntityType.CAN_DO_DESCRIPTOR,
};

const DOMAIN_TO_PRISMA_ENTITY_TYPE: Record<RelatableEntityType, $Enums.RelatableEntityType> = {
  [RelatableEntityType.CONTAINER]: 'CONTAINER',
  [RelatableEntityType.LESSON]: 'LESSON',
  [RelatableEntityType.VOCABULARY_LIST]: 'VOCABULARY_LIST',
  [RelatableEntityType.VOCABULARY_ITEM]: 'VOCABULARY_ITEM',
  [RelatableEntityType.GRAMMAR_RULE]: 'GRAMMAR_RULE',
  [RelatableEntityType.EXERCISE]: 'EXERCISE',
  [RelatableEntityType.CAN_DO_DESCRIPTOR]: 'CAN_DO_DESCRIPTOR',
};

export function prismaRelatableEntityTypeToDomain(
  v: $Enums.RelatableEntityType,
): RelatableEntityType {
  return PRISMA_TO_DOMAIN_ENTITY_TYPE[v];
}
export function domainRelatableEntityTypeToPrisma(
  v: RelatableEntityType,
): $Enums.RelatableEntityType {
  return DOMAIN_TO_PRISMA_ENTITY_TYPE[v];
}

const PRISMA_TO_DOMAIN_RELATION_KIND: Record<$Enums.RelationKind, RelationKind> = {
  INTRODUCES: RelationKind.INTRODUCES,
  FEATURES: RelationKind.FEATURES,
  PRACTICED_BY: RelationKind.PRACTICED_BY,
  PREREQUISITE: RelationKind.PREREQUISITE,
  RELATED: RelationKind.RELATED,
  TARGETS: RelationKind.TARGETS,
};

const DOMAIN_TO_PRISMA_RELATION_KIND: Record<RelationKind, $Enums.RelationKind> = {
  [RelationKind.INTRODUCES]: 'INTRODUCES',
  [RelationKind.FEATURES]: 'FEATURES',
  [RelationKind.PRACTICED_BY]: 'PRACTICED_BY',
  [RelationKind.PREREQUISITE]: 'PREREQUISITE',
  [RelationKind.RELATED]: 'RELATED',
  [RelationKind.TARGETS]: 'TARGETS',
};

export function prismaRelationKindToDomain(v: $Enums.RelationKind): RelationKind {
  return PRISMA_TO_DOMAIN_RELATION_KIND[v];
}
export function domainRelationKindToPrisma(v: RelationKind): $Enums.RelationKind {
  return DOMAIN_TO_PRISMA_RELATION_KIND[v];
}
