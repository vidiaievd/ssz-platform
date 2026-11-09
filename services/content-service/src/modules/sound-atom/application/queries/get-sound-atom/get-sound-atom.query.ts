// One `sound` atom with its texts, for the learner's card of a sound (plan 86, step 9.2).

export class GetSoundAtomQuery {
  constructor(
    /** The natural key, `nb:kj`. */
    public readonly atomId: string,
    /** The interface locale as the client sends it (`uk`, `nb-NO`); normalised by the handler. */
    public readonly locale: string,
  ) {}
}
