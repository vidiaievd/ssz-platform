import type { ClientTimeClaim } from '../../../../../shared/application/services/client-time.js';
export class SubmitAnswerCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    public readonly submittedAnswer: unknown,
    public readonly timeSpentSeconds: number,
    public readonly locale: string,
    /**
     * The phone's account of when this call was made, for a call replayed from its offline
     * journal (VoxOrd offline plan, B4); null for an online call. Bounded by
     * `resolveClientTime` before anything is dated by it.
     */
    public readonly clientTime: ClientTimeClaim | null = null,
  ) {}
}
