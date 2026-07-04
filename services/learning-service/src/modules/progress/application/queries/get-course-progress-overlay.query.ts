export class GetCourseProgressOverlayQuery {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
  ) {}
}
