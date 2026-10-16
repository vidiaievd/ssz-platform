import type { ClientTimeClaim } from '../../../../../shared/application/services/client-time.js';
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
    /**
     * Scheduled lesson this attempt is done in, when the caller names one (plan 57 §7).
     * Appended at the tail: the constructor is positional, and every existing call site
     * passes joinAttemptId last.
     */
    public readonly lessonId: string | null = null,
    /**
     * `minimal_pairs` only: a sitting the phone dealt and played with no network, handed over
     * when its journal is replayed (VoxOrd offline plan, B6). Taken instead of a fresh draw if
     * the kernel's `checkDraw` says this document could have dealt it. Untrusted, hence
     * `unknown` until checked.
     */
    public readonly probeDraw: unknown = null,
    /**
     * The phone's account of when this call was made, for a call replayed from its offline
     * journal (VoxOrd offline plan, B4); null for an online call. Bounded by
     * `resolveClientTime` before anything is dated by it.
     */
    public readonly clientTime: ClientTimeClaim | null = null,
  ) {}
}
