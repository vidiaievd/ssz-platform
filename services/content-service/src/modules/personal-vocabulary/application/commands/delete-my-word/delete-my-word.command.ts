export class DeleteMyWordCommand {
  constructor(
    public readonly userId: string,
    public readonly entryId: string,
  ) {}
}
