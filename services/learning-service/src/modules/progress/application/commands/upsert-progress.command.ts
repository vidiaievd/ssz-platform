export class UpsertProgressCommand {
  constructor(
    public readonly userId: string,
    public readonly contentType: string,
    public readonly contentId: string,
    public readonly timeSpentSeconds: number,
    public readonly score: number | null,
    public readonly completed: boolean,
    /**
     * When the work was done, if not now — an attempt worked on a phone offline and replayed
     * (VoxOrd offline plan, B4). Bounded by `boundReplayedTime` before it is recorded.
     */
    public readonly occurredAt?: Date,
  ) {}
}
