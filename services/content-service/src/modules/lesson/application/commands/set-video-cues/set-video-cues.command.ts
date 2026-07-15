export interface VideoCueInput {
  position: number;
  startSeconds: number;
  targetLine: string;
  translationLine?: string;
}

export class SetVideoCuesCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly cues: VideoCueInput[],
  ) {}
}
