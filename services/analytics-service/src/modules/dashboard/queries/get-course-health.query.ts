export class GetCourseHealthQuery {
  constructor(
    public readonly schoolId: string,
    public readonly viewerUserId: string,
  ) {}
}
