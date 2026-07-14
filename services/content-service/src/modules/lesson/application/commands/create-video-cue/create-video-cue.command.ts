export class CreateVideoCueCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly position: number,
    public readonly startSeconds: number,
    public readonly targetLine: string,
    public readonly translationLine?: string,
  ) {}
}
