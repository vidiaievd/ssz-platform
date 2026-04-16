export class DeleteVariantCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
  ) {}
}
