/**
 * The learner's own record of `minimal_pairs` sittings in the language of one exercise — what
 * `weakest` samples from (plan 72 §3.11), for a phone that deals offline (VoxOrd offline plan, B6).
 */
export class GetProbeHistoryQuery {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
    /** The learner's language for the content lookup; it does not change the answer. */
    public readonly language: string,
  ) {}
}
