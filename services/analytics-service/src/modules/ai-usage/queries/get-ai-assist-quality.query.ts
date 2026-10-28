export class GetAiAssistQualityQuery {
  constructor(
    /** Inclusive, UTC days `YYYY-MM-DD`. */
    public readonly from: string,
    public readonly to: string,
  ) {}
}
