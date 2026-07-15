export class ClearVideoQuestionCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
  ) {}
}
