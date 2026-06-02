export class GetActivityQuery {
  constructor(
    public readonly schoolId: string,
    public readonly viewerUserId: string,
    public readonly limit: number,
    public readonly cursor: string | undefined,
  ) {}
}
