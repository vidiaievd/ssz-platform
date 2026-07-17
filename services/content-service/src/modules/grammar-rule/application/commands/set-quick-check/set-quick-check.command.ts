export interface QuickCheckInput {
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export class SetQuickCheckCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly explanationId: string,
    /** null clears the quick-check (deletes the row) */
    public readonly quickCheck: QuickCheckInput | null,
  ) {}
}
