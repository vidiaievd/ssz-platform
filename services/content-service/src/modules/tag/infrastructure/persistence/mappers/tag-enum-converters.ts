import { $Enums } from '../../../../../../generated/prisma/client.js';
import { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';

// ─── TagCategory ─────────────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_CATEGORY: Record<$Enums.TagCategory, TagCategory> = {
  TOPIC: TagCategory.TOPIC,
  SITUATION: TagCategory.SITUATION,
  SKILL: TagCategory.SKILL,
  LEVEL: TagCategory.LEVEL,
  OTHER: TagCategory.OTHER,
};

const DOMAIN_TO_PRISMA_CATEGORY: Record<TagCategory, $Enums.TagCategory> = {
  [TagCategory.TOPIC]: 'TOPIC',
  [TagCategory.SITUATION]: 'SITUATION',
  [TagCategory.SKILL]: 'SKILL',
  [TagCategory.LEVEL]: 'LEVEL',
  [TagCategory.OTHER]: 'OTHER',
};

export function prismaTagCategoryToDomain(v: $Enums.TagCategory): TagCategory {
  return PRISMA_TO_DOMAIN_CATEGORY[v];
}
export function domainTagCategoryToPrisma(v: TagCategory): $Enums.TagCategory {
  return DOMAIN_TO_PRISMA_CATEGORY[v];
}

// ─── TagScope ─────────────────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_SCOPE: Record<$Enums.TagScope, TagScope> = {
  GLOBAL: TagScope.GLOBAL,
  SCHOOL: TagScope.SCHOOL,
};

const DOMAIN_TO_PRISMA_SCOPE: Record<TagScope, $Enums.TagScope> = {
  [TagScope.GLOBAL]: 'GLOBAL',
  [TagScope.SCHOOL]: 'SCHOOL',
};

export function prismaTagScopeToDomain(v: $Enums.TagScope): TagScope {
  return PRISMA_TO_DOMAIN_SCOPE[v];
}
export function domainTagScopeToPrisma(v: TagScope): $Enums.TagScope {
  return DOMAIN_TO_PRISMA_SCOPE[v];
}

// ─── TaggableEntityType ───────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_ENTITY_TYPE: Record<$Enums.TaggableEntityType, TaggableEntityType> = {
  CONTAINER: TaggableEntityType.CONTAINER,
  LESSON: TaggableEntityType.LESSON,
  VOCABULARY_LIST: TaggableEntityType.VOCABULARY_LIST,
  GRAMMAR_RULE: TaggableEntityType.GRAMMAR_RULE,
  EXERCISE: TaggableEntityType.EXERCISE,
};

const DOMAIN_TO_PRISMA_ENTITY_TYPE: Record<TaggableEntityType, $Enums.TaggableEntityType> = {
  [TaggableEntityType.CONTAINER]: 'CONTAINER',
  [TaggableEntityType.LESSON]: 'LESSON',
  [TaggableEntityType.VOCABULARY_LIST]: 'VOCABULARY_LIST',
  [TaggableEntityType.GRAMMAR_RULE]: 'GRAMMAR_RULE',
  [TaggableEntityType.EXERCISE]: 'EXERCISE',
};

export function prismaEntityTypeToDomain(v: $Enums.TaggableEntityType): TaggableEntityType {
  return PRISMA_TO_DOMAIN_ENTITY_TYPE[v];
}
export function domainEntityTypeToPrisma(v: TaggableEntityType): $Enums.TaggableEntityType {
  return DOMAIN_TO_PRISMA_ENTITY_TYPE[v];
}
