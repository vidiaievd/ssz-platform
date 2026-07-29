export class DeleteTextSpanCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly spanId: string,
  ) {}
}
