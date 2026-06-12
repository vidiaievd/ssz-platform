export class GetAtRiskQuery {
  constructor(
    public readonly schoolId: string,
    public readonly viewerUserId: string,
    public readonly limit: number,
  ) {}
}
