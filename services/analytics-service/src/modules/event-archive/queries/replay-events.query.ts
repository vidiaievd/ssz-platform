export class ReplayEventsQuery {
  constructor(
    public readonly fromSeq: number,
    public readonly types: string[],
    public readonly limit: number,
  ) {}
}
