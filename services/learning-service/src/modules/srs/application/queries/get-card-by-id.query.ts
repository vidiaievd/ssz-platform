export class GetCardByIdQuery {
  constructor(
    public readonly userId: string,
    public readonly cardId: string,
  ) {}
}
