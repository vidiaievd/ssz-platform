export class SuspendCardCommand {
  constructor(
    public readonly userId: string,
    public readonly cardId: string,
  ) {}
}
