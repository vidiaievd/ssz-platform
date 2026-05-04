export class GetDueCardsQuery {
  constructor(
    public readonly userId: string,
    public readonly limit: number = 20,
  ) {}
}
