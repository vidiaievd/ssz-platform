/** What is still open for one learner, soonest to expire first. */
export class ListMyProbesQuery {
  constructor(
    public readonly userId: string,
    public readonly limit: number,
  ) {}
}
