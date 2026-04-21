export class DeleteLessonCommand {
  constructor(
    public readonly userId: string,
    public readonly lessonId: string,
  ) {}
}
