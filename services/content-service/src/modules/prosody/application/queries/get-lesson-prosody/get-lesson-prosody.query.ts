export class GetLessonProsodyQuery {
  constructor(
    public readonly lessonId: string,
    public readonly variantId: string,
  ) {}
}
