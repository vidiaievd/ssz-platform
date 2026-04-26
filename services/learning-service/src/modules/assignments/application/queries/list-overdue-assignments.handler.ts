import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../../domain/repositories/assignment.repository.interface.js';
import { toAssignmentDto, type AssignmentDto } from '../dto/assignment.dto.js';
import { ListOverdueAssignmentsQuery } from './list-overdue-assignments.query.js';

@QueryHandler(ListOverdueAssignmentsQuery)
export class ListOverdueAssignmentsHandler
  implements IQueryHandler<ListOverdueAssignmentsQuery, AssignmentDto[]>
{
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
  ) {}

  async execute(query: ListOverdueAssignmentsQuery): Promise<AssignmentDto[]> {
    const all = await this.repo.findByAssigner(query.tutorId, { status: ['OVERDUE'] });
    return all.map(toAssignmentDto);
  }
}
