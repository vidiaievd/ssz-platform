import type { WeakRulesWindow } from '../domain/weak-rules.js';

export class GetGroupWeakRulesQuery {
  constructor(
    public readonly groupId: string,
    public readonly viewerUserId: string,
    public readonly window: WeakRulesWindow,
  ) {}
}

export class GetStudentWeakRulesQuery {
  constructor(
    public readonly studentId: string,
    public readonly viewerUserId: string,
    public readonly window: WeakRulesWindow,
    public readonly courseId: string | null,
  ) {}
}
