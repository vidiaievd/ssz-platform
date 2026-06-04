import type { IQuery } from '@nestjs/cqrs';

export class GetStudentDetailQuery implements IQuery {
  constructor(
    public readonly schoolId: string,
    public readonly viewerUserId: string,
    public readonly studentUserId: string,
  ) {}
}
