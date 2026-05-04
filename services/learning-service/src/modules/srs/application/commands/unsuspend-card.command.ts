export class UnsuspendCardCommand {
  constructor(
    public readonly userId: string,
    public readonly cardId: string,
  ) {}
}
