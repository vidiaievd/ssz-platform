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
}
