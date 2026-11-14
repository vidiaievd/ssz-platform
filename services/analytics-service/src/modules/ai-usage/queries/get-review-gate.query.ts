export class GetReviewGateQuery {
  constructor(
    /** Inclusive UTC days `YYYY-MM-DD`; null = from the first / up to the last row. */
    public readonly from: string | null,
    public readonly to: string | null,
  ) {}
}
