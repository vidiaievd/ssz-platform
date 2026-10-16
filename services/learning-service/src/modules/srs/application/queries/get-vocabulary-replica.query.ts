/**
 * Every vocabulary card of the user with its full FSRS state, plus the day's review budget —
 * what a client keeps to go on reviewing words without the server (VoxOrd offline plan, B1).
 */
export class GetVocabularyReplicaQuery {
  constructor(public readonly userId: string) {}
}
