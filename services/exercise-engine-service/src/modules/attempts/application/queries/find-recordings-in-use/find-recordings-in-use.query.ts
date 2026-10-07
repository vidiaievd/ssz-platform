/**
 * Which of these `read_aloud` recordings does some attempt still stand on? Asked by
 * media-service's orphan sweep (plan 71), which does not know attempts and must never delete
 * a file a submission points at.
 *
 * `liveDraftSince` is the sweep's own policy, not the engine's: a draft saved before it
 * belongs to an attempt nobody is recording into any more, so its takes are not held back.
 */
export class FindRecordingsInUseQuery {
  constructor(
    public readonly assetIds: readonly string[],
    public readonly liveDraftSince: Date,
  ) {}
}
