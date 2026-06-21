export class DeleteSectionCommand {
  constructor(
    public readonly userId: string,
    public readonly sectionId: string,
  ) {}
}
