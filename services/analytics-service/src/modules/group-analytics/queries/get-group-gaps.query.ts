/**
 * Every group of one school, as the dashboard's gap widget reads them (plan 58, phase 10).
 *
 * Keyed by school rather than by group, unlike the rest of `group-analytics`: the widget's
 * whole point is the comparison between groups, and asking one endpoint per row would
 * make a school of twenty groups twenty round trips.
 */
export class GetGroupGapsQuery {
  constructor(
    public readonly schoolId: string,
    public readonly viewerUserId: string,
  ) {}
}
