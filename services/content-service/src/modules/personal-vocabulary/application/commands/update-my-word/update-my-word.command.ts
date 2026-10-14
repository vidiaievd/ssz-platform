export class UpdateMyWordCommand {
  constructor(
    public readonly userId: string,
    public readonly entryId: string,
    public readonly translationLanguage: string,
    /** A corrected word, e.g. the dictionary form for the form as selected. Undefined keeps it. */
    public readonly word?: string,
    /** Undefined keeps the translation; null or blank removes it. */
    public readonly translation?: string | null,
  ) {}
}
