/** Used by the internal route — exercise-engine fetches the full attempt envelope. */
export class GetExerciseEnvelopeQuery {
  constructor(
    public readonly exerciseId: string,
    public readonly preferredInstructionLanguage?: string,
    /** 'graded' withholds expectedAnswers; any other value (or omitted) includes them. */
    public readonly mode?: string,
  ) {}
}
