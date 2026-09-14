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

/** What this learner knows only one way — plan 63 §4.1. */
export class GetModalityGapQuery {
  constructor(
    public readonly studentId: string,
    public readonly viewerUserId: string,
    public readonly courseId: string | null,
    public readonly limit: number,
  ) {}
}

/** What to practise next, and why — plan 63 §3 phase 8. */
export class GetNextPracticeQuery {
  constructor(
    public readonly studentId: string,
    public readonly viewerUserId: string,
    public readonly courseId: string | null,
    /** Minutes the learner (or the lesson) has for this. Clamped by the handler. */
    public readonly budgetMinutes: number,
  ) {}
}
