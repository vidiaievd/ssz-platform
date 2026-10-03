import type { SrsTrack } from '../../domain/value-objects/srs-track.js';

export class GetDueCardsQuery {
  constructor(
    public readonly userId: string,
    public readonly limit: number = 20,
    /** Preferred translation language for VOCABULARY_WORD card content. */
    public readonly language: string = 'en',
    /** Include usage examples in the resolved card content. */
    public readonly includeExamples: boolean = false,
    /**
     * One memory rather than the day's whole queue (plan 63 phase 6).
     *
     * Undefined means both, which is what every client asked for before the split and
     * what a learner sitting down to do today's work still wants.
     */
    public readonly track?: SrsTrack,
  ) {}
}
