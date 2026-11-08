export class GetSoundSessionItemsQuery {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** The learner's interface locale, for the base's instruction. */
    public readonly locale: string,
  ) {}
}
