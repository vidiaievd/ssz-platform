export class GetGroupHeatmapQuery {
  constructor(
    public readonly groupId: string,
    public readonly viewerUserId: string,
  ) {}
}
