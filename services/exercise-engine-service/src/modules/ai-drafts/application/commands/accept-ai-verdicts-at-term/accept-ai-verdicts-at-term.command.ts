/** Close the school work whose model verdict is due to count by itself (plan 80, step 4). */
export class AcceptAiVerdictsAtTermCommand {
  constructor(
    readonly now: Date = new Date(),
    /** How many to take in one pass; the rest wait for the next. */
    readonly limit: number = 100,
  ) {}
}
