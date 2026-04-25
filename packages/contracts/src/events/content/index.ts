import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const CONTENT_EVENT_TYPES = {
  // Container (course / module / collection)
  CONTAINER_CREATED: 'content.container.created',
  CONTAINER_UPDATED: 'content.container.updated',
  CONTAINER_PUBLISHED: 'content.container.published',
  CONTAINER_ARCHIVED: 'content.container.archived',
  CONTAINER_DEPRECATED: 'content.container.deprecated',
  CONTAINER_DELETED: 'content.container.deleted',
  // Lesson
  LESSON_CREATED: 'content.lesson.created',
  LESSON_UPDATED: 'content.lesson.updated',
  LESSON_DELETED: 'content.lesson.deleted',
  LESSON_VARIANT_CREATED: 'content.lesson.variant.created',
  LESSON_VARIANT_PUBLISHED: 'content.lesson.variant.published',
  // Vocabulary
  VOCABULARY_LIST_CREATED: 'content.vocabulary_list.created',
  VOCABULARY_LIST_UPDATED: 'content.vocabulary_list.updated',
  VOCABULARY_LIST_DELETED: 'content.vocabulary_list.deleted',
  VOCABULARY_ITEM_CREATED: 'content.vocabulary_item.created',
  VOCABULARY_ITEM_UPDATED: 'content.vocabulary_item.updated',
  VOCABULARY_ITEM_DELETED: 'content.vocabulary_item.deleted',
  VOCABULARY_TRANSLATION_ADDED: 'content.vocabulary_translation.added',
  // Grammar
  GRAMMAR_RULE_CREATED: 'content.grammar_rule.created',
  GRAMMAR_RULE_UPDATED: 'content.grammar_rule.updated',
  GRAMMAR_RULE_DELETED: 'content.grammar_rule.deleted',
  GRAMMAR_RULE_EXERCISE_POOL_CHANGED: 'content.grammar_rule.exercise_pool.changed',
  // Exercise
  EXERCISE_CREATED: 'content.exercise.created',
  EXERCISE_UPDATED: 'content.exercise.updated',
  EXERCISE_DELETED: 'content.exercise.deleted',
  // Tags
  TAG_CREATED: 'content.tag.created',
  TAG_UPDATED: 'content.tag.updated',
  TAG_DELETED: 'content.tag.deleted',
  // Sharing & Entitlements
  CONTENT_SHARED: 'content.shared',
  CONTENT_SHARE_REVOKED: 'content.share.revoked',
  ENTITLEMENT_GRANTED: 'content.entitlement.granted',
  ENTITLEMENT_REVOKED: 'content.entitlement.revoked',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

export interface ContainerPayload {
  containerId: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  type: string;
  visibility: string;
}

export interface ContainerUpdatedPayload {
  containerId: string;
  updatedFields: string[];
}

export interface ContainerDeletedPayload {
  containerId: string;
  ownerUserId: string;
}

export interface LessonPayload {
  lessonId: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  targetLanguage: string;
  visibility: string;
}

export interface LessonUpdatedPayload {
  lessonId: string;
  updatedFields: string[];
}

export interface LessonDeletedPayload {
  lessonId: string;
  ownerUserId: string;
}

export interface LessonVariantPayload {
  variantId: string;
  lessonId: string;
  language: string;
}

export interface VocabularyListPayload {
  listId: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  targetLanguage: string;
  visibility: string;
  autoAddToSrs: boolean;
}

export interface VocabularyListUpdatedPayload {
  listId: string;
  updatedFields: string[];
}

export interface VocabularyListDeletedPayload {
  listId: string;
  ownerUserId: string;
}

export interface VocabularyItemPayload {
  itemId: string;
  listId: string;
}

export interface VocabularyItemUpdatedPayload {
  itemId: string;
  listId: string;
  updatedFields: string[];
}

export interface VocabularyItemDeletedPayload {
  itemId: string;
  listId: string;
}

export interface VocabularyTranslationAddedPayload {
  itemId: string;
  listId: string;
  language: string;
}

export interface GrammarRulePayload {
  ruleId: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  targetLanguage: string;
  visibility: string;
}

export interface GrammarRuleUpdatedPayload {
  ruleId: string;
  updatedFields: string[];
}

export interface GrammarRuleDeletedPayload {
  ruleId: string;
  ownerUserId: string;
}

export interface GrammarRuleExercisePoolChangedPayload {
  ruleId: string;
  addedExerciseIds: string[];
  removedExerciseIds: string[];
}

export interface ExercisePayload {
  exerciseId: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  type: string;
}

export interface ExerciseUpdatedPayload {
  exerciseId: string;
  updatedFields: string[];
}

export interface ExerciseDeletedPayload {
  exerciseId: string;
  ownerUserId: string;
}

export interface TagPayload {
  tagId: string;
  name: string;
  category: string;
  scope: string;
  schoolId: string | null;
}

export interface TagUpdatedPayload {
  tagId: string;
  updatedFields: string[];
}

export interface TagDeletedPayload {
  tagId: string;
}

export interface ContentSharedPayload {
  shareId: string;
  entityType: string;
  entityId: string;
  ownerUserId: string;
  targetUserId: string | null;
  targetSchoolId: string | null;
  permission: string;
}

export interface ContentShareRevokedPayload {
  shareId: string;
  entityType: string;
  entityId: string;
}

export interface EntitlementGrantedPayload {
  entitlementId: string;
  userId: string;
  entityType: string;
  entityId: string;
  type: string;
  expiresAt: string | null;
}

export interface EntitlementRevokedPayload {
  entitlementId: string;
  userId: string;
  entityType: string;
  entityId: string;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type ContainerCreatedEvent = BaseEvent<ContainerPayload>;
export type ContainerUpdatedEvent = BaseEvent<ContainerUpdatedPayload>;
export type ContainerPublishedEvent = BaseEvent<ContainerPayload>;
export type ContainerArchivedEvent = BaseEvent<ContainerPayload>;
export type ContainerDeprecatedEvent = BaseEvent<ContainerPayload>;
export type ContainerDeletedEvent = BaseEvent<ContainerDeletedPayload>;

export type LessonCreatedEvent = BaseEvent<LessonPayload>;
export type LessonUpdatedEvent = BaseEvent<LessonUpdatedPayload>;
export type LessonDeletedEvent = BaseEvent<LessonDeletedPayload>;
export type LessonVariantCreatedEvent = BaseEvent<LessonVariantPayload>;
export type LessonVariantPublishedEvent = BaseEvent<LessonVariantPayload>;

export type VocabularyListCreatedEvent = BaseEvent<VocabularyListPayload>;
export type VocabularyListUpdatedEvent = BaseEvent<VocabularyListUpdatedPayload>;
export type VocabularyListDeletedEvent = BaseEvent<VocabularyListDeletedPayload>;
export type VocabularyItemCreatedEvent = BaseEvent<VocabularyItemPayload>;
export type VocabularyItemUpdatedEvent = BaseEvent<VocabularyItemUpdatedPayload>;
export type VocabularyItemDeletedEvent = BaseEvent<VocabularyItemDeletedPayload>;
export type VocabularyTranslationAddedEvent = BaseEvent<VocabularyTranslationAddedPayload>;

export type GrammarRuleCreatedEvent = BaseEvent<GrammarRulePayload>;
export type GrammarRuleUpdatedEvent = BaseEvent<GrammarRuleUpdatedPayload>;
export type GrammarRuleDeletedEvent = BaseEvent<GrammarRuleDeletedPayload>;
export type GrammarRuleExercisePoolChangedEvent = BaseEvent<GrammarRuleExercisePoolChangedPayload>;

export type ExerciseCreatedEvent = BaseEvent<ExercisePayload>;
export type ExerciseUpdatedEvent = BaseEvent<ExerciseUpdatedPayload>;
export type ExerciseDeletedEvent = BaseEvent<ExerciseDeletedPayload>;

export type TagCreatedEvent = BaseEvent<TagPayload>;
export type TagUpdatedEvent = BaseEvent<TagUpdatedPayload>;
export type TagDeletedEvent = BaseEvent<TagDeletedPayload>;

export type ContentSharedEvent = BaseEvent<ContentSharedPayload>;
export type ContentShareRevokedEvent = BaseEvent<ContentShareRevokedPayload>;
export type EntitlementGrantedEvent = BaseEvent<EntitlementGrantedPayload>;
export type EntitlementRevokedEvent = BaseEvent<EntitlementRevokedPayload>;
