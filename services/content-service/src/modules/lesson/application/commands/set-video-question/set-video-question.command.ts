export class SetVideoQuestionCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly exerciseId: string,
  ) {}
}
