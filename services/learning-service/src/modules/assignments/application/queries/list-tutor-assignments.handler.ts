import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../../domain/repositories/assignment.repository.interface.js';
import { toAssignmentDto, type AssignmentDto } from '../dto/assignment.dto.js';
import { ListTutorAssignmentsQuery } from './list-tutor-assignments.query.js';

@QueryHandler(ListTutorAssignmentsQuery)
export class ListTutorAssignmentsHandler
  implements IQueryHandler<ListTutorAssignmentsQuery, AssignmentDto[]>
{
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
  ) {}

  async execute(query: ListTutorAssignmentsQuery): Promise<AssignmentDto[]> {
    const assignments = await this.repo.findByAssigner(query.tutorId, {
      status: query.status,
      assigneeId: query.assigneeId,
    });
    return assignments.map(toAssignmentDto);
  }
}
