export class RenameSectionCommand {
  constructor(
    public readonly userId: string,
    public readonly sectionId: string,
    public readonly title: string,
  ) {}
}
