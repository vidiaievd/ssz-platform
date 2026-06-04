import type { IQuery } from '@nestjs/cqrs';

export type StudentSegment = 'active' | 'at-risk' | 'new' | 'finished' | 'unassigned' | 'all';

export class GetSchoolStudentsQuery implements IQuery {
  constructor(
    public readonly schoolId: string,
    public readonly viewerUserId: string,
    public readonly segment: StudentSegment = 'all',
    public readonly search: string | undefined,
    public readonly limit: number,
    public readonly cursor: string | undefined,
  ) {}
}
