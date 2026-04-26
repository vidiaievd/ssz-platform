export class ListUserSubmissionsQuery {
  constructor(
    public readonly userId: string,
    public readonly status?: string,
    public readonly limit?: number,
    public readonly offset?: number,
  ) {}
}
