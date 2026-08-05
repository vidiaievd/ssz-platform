import type { Result } from '../../kernel/result.js';
import type { ContentRef, ContentType } from '../../../shared/domain/value-objects/content-ref.js';

export class ContentClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ContentClientError';
  }
}

export interface ContentMetadata {
  id: string;
  type: ContentType;
  title: string;
  targetLanguage?: string;
  estimatedMinutes?: number;
}

export interface VisibilityResult {
  isVisible: boolean;
  reason?: string;
}

export type AccessTier =
  | 'PUBLIC_FREE'
  | 'FREE_WITHIN_SCHOOL'
  | 'PUBLIC_PAID'
  | 'ENTITLEMENT_REQUIRED'
  | 'ASSIGNED_ONLY';

// Mirrors content-service's RelatableEntityType/RelationKind wire values
// exactly (plan 21 §1) — lowercase, snake_case, as sent/received over HTTP.
export type RelatableEntityType =
  | 'container'
  | 'lesson'
  | 'vocabulary_list'
  | 'vocabulary_item'
  | 'grammar_rule'
  | 'exercise'
  | 'can_do_descriptor';

export type RelationKind = 'introduces' | 'features' | 'practiced_by' | 'prerequisite' | 'related' | 'targets';

export interface ContentRelationRef {
  id: string;
  sourceType: RelatableEntityType;
  sourceId: string;
  targetType: RelatableEntityType;
  targetId: string;
  relationKind: RelationKind;
}

export interface ModuleReaderStructureItemRef {
  id: string;
  ref: ContentRef;
  title: string | null;
  position: number;
  lessonKind: string | null;
  durationMinutes: number | null;
  xpReward: number | null;
}

export interface ModuleReaderStructureSectionRef {
  id: string;
  title: string;
  position: number;
  items: ModuleReaderStructureItemRef[];
}

export interface ModuleReaderStructureRef {
  moduleId: string;
  moduleTitle: string | null;
  sections: ModuleReaderStructureSectionRef[];
  ungroupedItems: ModuleReaderStructureItemRef[];
}

// A course leaf item enriched with its sub-lesson (module) attribution and
// required flag — drives per-sub-lesson completion and sequential gating.
export interface CourseLeafItemRef {
  ref: ContentRef;
  // Nearest top-level MODULE ancestor under the course; null when the leaf sits
  // directly under the course.
  moduleId: string | null;
  isRequired: boolean;
}

export const CONTENT_CLIENT = Symbol('IContentClient');

export interface IContentClient {
  getContentMetadata(
    ref: ContentRef,
  ): Promise<Result<ContentMetadata, ContentClientError>>;

  checkVisibilityForUser(
    ref: ContentRef,
    userId: string,
  ): Promise<Result<VisibilityResult, ContentClientError>>;

  getAccessTier(
    containerId: string,
  ): Promise<Result<AccessTier, ContentClientError>>;

  // Returns all leaf content refs in a container (for completion tracking).
  // Leaf items are: LESSON, VOCABULARY_LIST, GRAMMAR_RULE, EXERCISE.
  getContainerLeafItems(
    containerId: string,
  ): Promise<Result<ContentRef[], ContentClientError>>;

  // Same leaf items as getContainerLeafItems, enriched with each leaf's
  // sub-lesson (module) attribution and required flag — used to compute
  // per-sub-lesson progress and sequential-unlock statuses.
  getCourseLeafItems(
    courseId: string,
  ): Promise<Result<CourseLeafItemRef[], ContentClientError>>;

  // Returns vocabulary item IDs for a list. Used by BulkIntroduceFromVocabularyListHandler.
  // Calls GET /api/internal/vocabulary-lists/{listId}/items on Content Service.
  getVocabularyListItems(
    listId: string,
  ): Promise<Result<string[], ContentClientError>>;

  // Returns whether a vocabulary list has auto_add_to_srs = true.
  // Calls GET /api/internal/vocabulary-lists/{listId} on Content Service.
  getVocabularyListAutoAddToSrs(
    listId: string,
  ): Promise<Result<boolean, ContentClientError>>;

  // ContentRelation graph traversal (plan 21 §1/§2.1), forward direction:
  // "what does this atom introduce/feature/etc." Used by mastery roll-ups.
  getRelationsBySource(
    sourceType: RelatableEntityType,
    sourceId: string,
    relationKind?: RelationKind,
  ): Promise<Result<ContentRelationRef[], ContentClientError>>;

  // Reverse direction: "which atoms point at this one" — e.g. "which texts
  // use this word", or fan-out from an EXERCISE to the atoms it practices.
  getRelationsByTarget(
    targetType: RelatableEntityType,
    targetId: string,
    relationKind?: RelationKind,
  ): Promise<Result<ContentRelationRef[], ContentClientError>>;

  // Exercise ids in a grammar rule's pool — used to derive rule mastery from
  // the retrievability of those exercises' own SRS cards (plan 21 §2.2).
  getGrammarRulePoolExerciseIds(
    ruleId: string,
  ): Promise<Result<string[], ContentClientError>>;

  // Batch-fetch can-do descriptors by IDs to resolve their skills
  // (for the mastery-by-skill breakdown — plan 23 B5.1).
  getCanDoDescriptorsByIds(
    ids: string[],
  ): Promise<Result<CanDoDescriptorRef[], ContentClientError>>;

  // Ordered sections → items tree for a module's published version, used by
  // GetUnitContentsHandler to build the reader sidebar (plan 29 BE3.1).
  getModuleReaderStructure(
    moduleId: string,
  ): Promise<Result<ModuleReaderStructureRef, ContentClientError>>;

  // Batch-fetch vocabulary items resolved for display (translation-fallback
  // applied server-side). Used to enrich VOCABULARY_WORD review cards, which
  // carry only the item id, with the word text a trainer needs to render.
  getVocabularyItemsForDisplay(
    itemIds: string[],
    translationLanguage: string,
    options?: { includeExamples?: boolean; examplesLimit?: number },
  ): Promise<Result<VocabularyItemDisplayRef[], ContentClientError>>;
}

// Mirrors content-service's VocabularyItemDisplayResult over the wire.
export interface VocabularyItemDisplayRef {
  itemId: string;
  listId: string;
  word: string;
  partOfSpeech: string | null;
  ipaTranscription: string | null;
  pronunciationAudioMediaId: string | null;
  translation: {
    language: string;
    primaryTranslation: string;
    alternativeTranslations: string[];
    definition: string | null;
    usageNotes: string | null;
    fallbackUsed: boolean;
  } | null;
  immersionMode: boolean;
  examples: Array<{
    id: string;
    exampleText: string;
    audioMediaId: string | null;
    translation: { translatedText: string } | null;
  }>;
}

export interface CanDoDescriptorRef {
  id: string;
  cefrLevel: string;
  skill: string;
}
