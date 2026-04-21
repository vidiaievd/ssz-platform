export class GetLessonVariantsQuery {
  constructor(
    public readonly lessonId: string,
    public readonly onlyPublished: boolean = false,
  ) {}
}
