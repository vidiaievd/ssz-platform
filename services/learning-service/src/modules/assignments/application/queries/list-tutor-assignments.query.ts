import type { IQuery } from '@nestjs/cqrs';
import type { AssignmentStatus } from '../../domain/entities/assignment.entity.js';

export class ListTutorAssignmentsQuery implements IQuery {
  constructor(
    public readonly tutorId: string,
    public readonly status?: AssignmentStatus[],
    public readonly assigneeId?: string,
  ) {}
}
