export interface CompareExampleInput {
  position: number;
  sentence: string;
  note?: string;
  isCorrect: boolean;
}

export class SetCompareExamplesCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly explanationId: string,
    public readonly items: CompareExampleInput[],
  ) {}
}
