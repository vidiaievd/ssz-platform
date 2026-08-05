export class GetDueCardsQuery {
  constructor(
    public readonly userId: string,
    public readonly limit: number = 20,
    /** Preferred translation language for VOCABULARY_WORD card content. */
    public readonly language: string = 'en',
    /** Include usage examples in the resolved card content. */
    public readonly includeExamples: boolean = false,
  ) {}
}
