export class SentenceCheckCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** The prompt of the reading the sentence is from. */
    public readonly itemId: string,
    /** The sentence as the learner saw it, markdown signs off. */
    public readonly sentence: string,
    /** The learner's take of the sentence (media id). */
    public readonly recordingAssetId: string,
    /** The interface language, for a learner with no school to explain the sounds in. */
    public readonly explanationLanguage: string | null,
  ) {}
}
