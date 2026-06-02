export class GetKpisQuery {
  constructor(
    public readonly schoolId: string,
    public readonly viewerUserId: string,
  ) {}
}
