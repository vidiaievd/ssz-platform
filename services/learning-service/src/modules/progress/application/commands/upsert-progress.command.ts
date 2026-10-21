/**
 * How the exercise engine judged an attempt (plan 76, 2.6). Only the engine says this: it
 * is the one that knows whether the attempt passed, and a command without an outcome is a
 * client reporting an exercise, which changes nothing — see the handler.
 */
export type ExerciseOutcome = 'passed' | 'failed' | 'submitted' | 'returned';

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
    public readonly outcome?: ExerciseOutcome,
  ) {}
}
