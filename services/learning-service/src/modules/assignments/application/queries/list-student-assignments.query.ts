import type { IQuery } from '@nestjs/cqrs';
import type { AssignmentStatus } from '../../domain/entities/assignment.entity.js';

export class ListStudentAssignmentsQuery implements IQuery {
  constructor(
    public readonly studentId: string,
    public readonly status?: AssignmentStatus[],
    public readonly dueWithinDays?: number,
  ) {}
}
