/**
 * Who hears about work nobody answered in time (plan 47.5/47.6).
 *
 * `groupIds` is the late work's own groups, and matters only for the `primary_teacher`
 * target: the primary teacher of a group is a per-group fact, and a school-wide answer to
 * "who is the primary teacher" does not exist. The other two targets ignore it.
 */
export class GetReviewEscalationRecipientsQuery {
  constructor(
    readonly schoolId: string,
    readonly groupIds: string[],
    readonly at: Date,
  ) {}
}
