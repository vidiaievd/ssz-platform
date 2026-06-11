export class GetMyPermissionsQuery {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
  ) {}
}
