/**
 * Hand out the probe a `minimal_pairs` sitting is on (plan 72 §3.6).
 *
 * README of the handoff: «the attempt opens once and each probe is handed out by its own
 * command, so the drawn order never sits in the page». This is that command. It changes
 * nothing — it reads the draw and the picks — so a reload asks it again and gets the same probe.
 */
export class HandOutProbeCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
  ) {}
}
