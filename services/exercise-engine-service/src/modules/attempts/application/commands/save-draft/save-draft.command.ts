import type { ClientTimeClaim } from '../../../../../shared/application/services/client-time.js';
export class SaveDraftCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** The work so far, in the template's own shape. Stored as it arrives. */
    public readonly draftAnswer: unknown,
    /**
     * The phone's account of when this call was made, for a call replayed from its offline
     * journal (VoxOrd offline plan, B4); null for an online call. Bounded by
     * `resolveClientTime` before anything is dated by it.
     */
    public readonly clientTime: ClientTimeClaim | null = null,
  ) {}
}
