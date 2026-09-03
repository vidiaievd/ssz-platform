import type { CheckMode } from '../../../domain/entities/attempt.entity.js';

export class StartAttemptCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
    public readonly language: string,
    public readonly assignmentId: string | null,
    public readonly enrollmentId: string | null,
    public readonly checkMode: CheckMode,
    /**
     * An attempt the caller already knows is open and wants handed back rather than
     * conflicted with.
     *
     * Only a caller that has just been told about an attempt can name one, and that is
     * the point: two tabs starting the same exercise at the same moment both abandon the
     * stale attempt and both start a fresh one, and the one that loses is told about an
     * attempt it never opened. Joining it is the truthful outcome — the exercise is open
     * and can be submitted into — but the caller cannot draw the board without the
     * projection, which is dealt here and seeded by the attempt's own id. So it asks for
     * that attempt by name and gets it back whole.
     *
     * Ignored unless it is the caller's own in-progress attempt at this exercise.
     */
    public readonly joinAttemptId: string | null = null,
  ) {}
}
