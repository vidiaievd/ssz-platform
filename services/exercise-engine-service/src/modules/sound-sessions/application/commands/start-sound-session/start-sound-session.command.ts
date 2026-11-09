export class StartSoundSessionCommand {
  constructor(
    public readonly userId: string,
    /** The language whose sounds are drilled (`nb`). */
    public readonly language: string,
    /** A sound the learner chose (from its card); null — the session chooses (Q31). */
    public readonly atomId: string | null,
  ) {}
}
