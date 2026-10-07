import type { Result } from '../../kernel/result.js';

export const RECORDING_USAGE = Symbol('RECORDING_USAGE');

export type RecordingUsageError = 'ENGINE_UNAVAILABLE' | 'ENGINE_REFUSED' | 'ENGINE_BAD_ANSWER';

/**
 * Asks the owner of attempts which recordings an attempt still stands on (plan 71). This
 * service does not know attempts, so it never decides on its own that a file is unused: a
 * failed question is an error, and an error means nothing is deleted.
 */
export interface IRecordingUsage {
  /**
   * The ids, out of `assetIds`, that a submission points at, or that sit on the draft of an
   * attempt saved at or after `liveDraftSince`.
   */
  inUse(assetIds: readonly string[], liveDraftSince: Date): Promise<Result<Set<string>, RecordingUsageError>>;
}
