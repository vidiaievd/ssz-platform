/**
 * Read one probe as the learner it was dealt to.
 *
 * Both the id and the reader, always. A probe is one person's — asking for one by id
 * alone is a question this module never answers, and leaving the reader out of the query
 * is how that rule ends up enforced in a controller instead of in a handler.
 */
export class GetProbeQuery {
  constructor(
    public readonly probeId: string,
    public readonly userId: string,
  ) {}
}
