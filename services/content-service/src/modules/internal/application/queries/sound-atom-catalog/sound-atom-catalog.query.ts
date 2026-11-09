// The `sound` atoms of a language, as a model and a learner's card are shown them (plan 86, step 8.1).

export class GetSoundAtomCatalogQuery {
  constructor(
    /** The inventory's language — `nb`, as the atom ids spell it. */
    public readonly language: string,
    /** The interface locale the texts are wanted in; a missing one falls back to English. */
    public readonly locale: string,
  ) {}
}
