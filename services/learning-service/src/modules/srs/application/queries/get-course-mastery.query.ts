export class GetCourseMasteryQuery {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
  ) {}
}
