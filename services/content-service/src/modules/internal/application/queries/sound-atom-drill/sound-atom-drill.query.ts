// The drill material of scored `sound` atoms for the pronunciation session (plan 86, step 13.2).

export class GetSoundAtomDrillQuery {
  constructor(
    /** The inventory's language — `nb`, as the atom ids spell it. */
    public readonly language: string,
    /** The atoms wanted (`nb:kj`); empty = every scored atom of the language. */
    public readonly atomIds: readonly string[],
  ) {}
}
