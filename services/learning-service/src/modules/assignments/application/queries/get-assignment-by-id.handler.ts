import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../../domain/repositories/assignment.repository.interface.js';
import { ORGANIZATION_CLIENT, type IOrganizationClient } from '../../../../shared/application/ports/organization-client.port.js';
import {
  AssignmentApplicationError,
  AssignmentForbiddenError,
  AssignmentNotFoundError,
  OrganizationServiceUnavailableError,
} from '../errors/assignment-application.errors.js';
import { toAssignmentDto, type AssignmentDto } from '../dto/assignment.dto.js';
import { GetAssignmentByIdQuery } from './get-assignment-by-id.query.js';

@QueryHandler(GetAssignmentByIdQuery)
export class GetAssignmentByIdHandler
  implements IQueryHandler<GetAssignmentByIdQuery, Result<AssignmentDto, AssignmentApplicationError>>
{
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
  ) {}

  async execute(query: GetAssignmentByIdQuery): Promise<Result<AssignmentDto, AssignmentApplicationError>> {
    const assignment = await this.repo.findById(query.id);
    if (!assignment) {
      return Result.fail(new AssignmentNotFoundError(query.id));
    }

    const isAssigner = assignment.assignerId === query.requestingUserId;
    const isAssignee = assignment.assigneeId === query.requestingUserId;
    const isPlatformAdmin = query.requestingUserRoles.includes('platform_admin');

    if (isAssigner || isAssignee || isPlatformAdmin) {
      return Result.ok(toAssignmentDto(assignment));
    }

    // Check if requesting user is school admin
    if (assignment.schoolId) {
      const roleResult = await this.orgClient.getMemberRole(assignment.schoolId, query.requestingUserId);
      if (roleResult.isFail) {
        return Result.fail(new OrganizationServiceUnavailableError(roleResult.error.message));
      }
      const role = roleResult.value;
      if (role && ['OWNER', 'ADMIN'].includes(role)) {
        return Result.ok(toAssignmentDto(assignment));
      }
    }

    return Result.fail(new AssignmentForbiddenError('view this assignment'));
  }
}
