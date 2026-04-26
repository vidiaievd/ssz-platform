import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../../domain/repositories/assignment.repository.interface.js';
import { toAssignmentDto, type AssignmentDto } from '../dto/assignment.dto.js';
import { ListStudentAssignmentsQuery } from './list-student-assignments.query.js';

@QueryHandler(ListStudentAssignmentsQuery)
export class ListStudentAssignmentsHandler
  implements IQueryHandler<ListStudentAssignmentsQuery, AssignmentDto[]>
{
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
  ) {}

  async execute(query: ListStudentAssignmentsQuery): Promise<AssignmentDto[]> {
    let assignments = await this.repo.findByAssignee(query.studentId, { status: query.status });

    if (query.dueWithinDays !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + query.dueWithinDays);
      assignments = assignments.filter((a) => a.dueAt <= cutoff);
    }

    return assignments.map(toAssignmentDto);
  }
}
