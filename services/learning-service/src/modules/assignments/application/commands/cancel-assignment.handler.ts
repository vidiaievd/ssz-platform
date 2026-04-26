import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../../domain/repositories/assignment.repository.interface.js';
import { ORGANIZATION_CLIENT, type IOrganizationClient } from '../../../../shared/application/ports/organization-client.port.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import {
  AssignmentApplicationError,
  AssignmentForbiddenError,
  AssignmentNotFoundError,
  AssignmentDomainValidationError,
  OrganizationServiceUnavailableError,
} from '../errors/assignment-application.errors.js';
import { toAssignmentDto, type AssignmentDto } from '../dto/assignment.dto.js';
import { CancelAssignmentCommand } from './cancel-assignment.command.js';

@CommandHandler(CancelAssignmentCommand)
export class CancelAssignmentHandler
  implements ICommandHandler<CancelAssignmentCommand, Result<AssignmentDto, AssignmentApplicationError>>
{
  private readonly logger = new Logger(CancelAssignmentHandler.name);

  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: CancelAssignmentCommand): Promise<Result<AssignmentDto, AssignmentApplicationError>> {
    const assignment = await this.repo.findById(cmd.assignmentId);
    if (!assignment) {
      return Result.fail(new AssignmentNotFoundError(cmd.assignmentId));
    }

    // Authorization: assigner, platform admin, or school admin can cancel
    const isAssigner = assignment.assignerId === cmd.requestingUserId;
    const isPlatformAdmin = cmd.requestingUserRoles.includes('platform_admin');

    if (!isAssigner && !isPlatformAdmin) {
      // Check school admin
      if (!assignment.schoolId) {
        return Result.fail(new AssignmentForbiddenError('cancel this assignment'));
      }
      const roleResult = await this.orgClient.getMemberRole(assignment.schoolId, cmd.requestingUserId);
      if (roleResult.isFail) {
        return Result.fail(new OrganizationServiceUnavailableError(roleResult.error.message));
      }
      const role = roleResult.value;
      if (!role || !['OWNER', 'ADMIN'].includes(role)) {
        return Result.fail(new AssignmentForbiddenError('cancel this assignment'));
      }
    }

    const cancelResult = assignment.cancel(cmd.reason);
    if (cancelResult.isFail) {
      return Result.fail(new AssignmentDomainValidationError(cancelResult.error.message));
    }

    await this.repo.save(assignment);
    this.logger.log(`Assignment cancelled: ${assignment.id}`);

    for (const event of assignment.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    assignment.clearDomainEvents();

    return Result.ok(toAssignmentDto(assignment));
  }
}
