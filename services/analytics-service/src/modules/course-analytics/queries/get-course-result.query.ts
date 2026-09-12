export class GetCourseResultQuery {
  constructor(
    public readonly containerId: string,
    public readonly viewerUserId: string,
  ) {}
}
