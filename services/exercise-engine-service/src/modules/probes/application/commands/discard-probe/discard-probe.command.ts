/**
 * Throw a probe away before its time.
 *
 * The learner's own gesture — "not this one" — and the reason it is a command rather
 * than a wait: a task that has been rejected should not sit in the list until it
 * expires, and it produces no evidence either way. Discarding is not evidence of
 * anything; refusing to answer a generated question says nothing about the atom.
 */
export class DiscardProbeCommand {
  constructor(
    public readonly probeId: string,
    public readonly userId: string,
  ) {}
}
