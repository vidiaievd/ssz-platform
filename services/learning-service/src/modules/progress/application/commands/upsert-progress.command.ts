export class UpsertProgressCommand {
  constructor(
    public readonly userId: string,
    public readonly contentType: string,
    public readonly contentId: string,
    public readonly timeSpentSeconds: number,
    public readonly score: number | null,
    public readonly completed: boolean,
  ) {}
}
