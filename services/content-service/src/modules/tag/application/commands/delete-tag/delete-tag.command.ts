export class DeleteTagCommand {
  constructor(
    public readonly tagId: string,
    public readonly userId: string,
    public readonly isPlatformAdmin: boolean,
  ) {}
}
