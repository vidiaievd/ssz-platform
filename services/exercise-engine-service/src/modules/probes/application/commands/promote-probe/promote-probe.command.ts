/**
 * Keep this one — plan 63 phase 9.
 *
 * The gesture that gives generated material a way into the catalogue without the
 * catalogue filling up with everything ever generated. Nine tasks out of ten are asked
 * once and forgotten; the tenth is the one somebody reads and thinks is a better question
 * than the one they would have written. That one becomes an exercise, with the address
 * already on it.
 */
export class PromoteProbeCommand {
  constructor(
    public readonly probeId: string,
    /** Who is asking. Must be the probe's learner or the person who made it. */
    public readonly userId: string,
  ) {}
}
