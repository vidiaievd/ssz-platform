export class GetGroupProgressQuery {
  constructor(
    public readonly groupId: string,
    public readonly viewerUserId: string,
  ) {}
}
