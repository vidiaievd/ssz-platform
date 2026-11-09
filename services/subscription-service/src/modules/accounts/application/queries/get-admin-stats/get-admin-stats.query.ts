export class GetAdminStatsQuery {
  constructor(
    /** Days ahead the ending-soon lists look into, 1–90. */
    readonly withinDays: number,
  ) {}
}
