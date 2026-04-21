export class PublishVariantCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
  ) {}
}
