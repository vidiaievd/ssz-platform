import type { Result } from '../../kernel/result.js';

export const LESSON_MEDIA_USAGE = Symbol('LESSON_MEDIA_USAGE');

export type LessonMediaUsageError = 'CONTENT_UNAVAILABLE' | 'CONTENT_REFUSED' | 'CONTENT_BAD_ANSWER';

/**
 * Asks content-service which assets content still names — a lesson body, a cover, a word's
 * audio (plans 74, 76). This service does not know lessons, so an asset is never judged unused
 * on its own: a failed question is an error, and an error means nothing is deleted.
 */
export interface ILessonMediaUsage {
  inUse(assetIds: readonly string[]): Promise<Result<Set<string>, LessonMediaUsageError>>;
}
