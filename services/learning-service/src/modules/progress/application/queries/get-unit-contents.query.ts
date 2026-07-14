export class GetUnitContentsQuery {
  constructor(
    public readonly userId: string,
    public readonly moduleId: string,
  ) {}
}
