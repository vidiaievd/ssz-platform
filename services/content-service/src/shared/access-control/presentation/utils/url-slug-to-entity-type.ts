import { TaggableEntityType } from '../../domain/types/taggable-entity-type.js';

const URL_SLUG_TO_ENTITY_TYPE: Record<string, TaggableEntityType> = {
  containers: TaggableEntityType.CONTAINER,
  lessons: TaggableEntityType.LESSON,
  'vocabulary-lists': TaggableEntityType.VOCABULARY_LIST,
  'grammar-rules': TaggableEntityType.GRAMMAR_RULE,
  exercises: TaggableEntityType.EXERCISE,
};

const ENTITY_TYPE_TO_URL_SLUG: Record<TaggableEntityType, string> = {
  [TaggableEntityType.CONTAINER]: 'containers',
  [TaggableEntityType.LESSON]: 'lessons',
  [TaggableEntityType.VOCABULARY_LIST]: 'vocabulary-lists',
  [TaggableEntityType.GRAMMAR_RULE]: 'grammar-rules',
  [TaggableEntityType.EXERCISE]: 'exercises',
};

export function urlSlugToEntityType(slug: string): TaggableEntityType | null {
  return URL_SLUG_TO_ENTITY_TYPE[slug] ?? null;
}

export function entityTypeToUrlSlug(type: TaggableEntityType): string {
  return ENTITY_TYPE_TO_URL_SLUG[type];
}
