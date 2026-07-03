export class ApplyPlacementCommand {
  constructor(
    public readonly userId: string,
    public readonly courseId: string,
    public readonly placedLevel: string,
  ) {}
}
