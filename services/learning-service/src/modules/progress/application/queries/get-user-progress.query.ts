export class GetUserProgressQuery {
  constructor(
    public readonly userId: string,
    public readonly contentType?: string,
  ) {}
}
