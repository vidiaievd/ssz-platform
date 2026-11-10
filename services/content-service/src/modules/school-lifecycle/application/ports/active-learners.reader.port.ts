import type { StudiedKind } from '../../domain/school-materials.js';

export const ACTIVE_LEARNERS_READER = Symbol('ACTIVE_LEARNERS_READER');

export interface ActiveLearnersQuestion {
  kind: StudiedKind;
  id: string;
  /** For containers: the studied materials inside (progress on them is activity in it). */
  leafIds: string[];
}

/**
 * learning-service's count of learners still actively using content. Throws when learning cannot
 * answer — doubt is never deletion.
 */
export interface IActiveLearnersReader {
  /** Key = `${kind}:${id}`; only entries with at least one active learner. */
  countActive(
    questions: readonly ActiveLearnersQuestion[],
    activeSince: Date,
  ): Promise<Map<string, number>>;
}
