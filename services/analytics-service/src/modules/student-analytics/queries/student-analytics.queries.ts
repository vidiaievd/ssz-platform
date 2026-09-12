export class GetStudentGridQuery {
  constructor(
    public readonly studentId: string,
    public readonly viewerUserId: string,
    public readonly courseId: string | null,
  ) {}
}

export class GetStudentPositionQuery {
  constructor(
    public readonly studentId: string,
    public readonly viewerUserId: string,
    public readonly groupId: string,
  ) {}
}

export class GetStudentWorkContextQuery {
  constructor(
    public readonly studentId: string,
    public readonly viewerUserId: string,
    public readonly courseId: string | null,
  ) {}
}
