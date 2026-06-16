export class GetMyPlacementByLangQuery {
  constructor(
    readonly userId: string,
    readonly language: string,
  ) {}
}
