import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Assignment } from '../../domain/entities/assignment.entity.js';
import { ContentRef } from '../../../../shared/domain/value-objects/content-ref.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../../domain/repositories/assignment.repository.interface.js';
import { CONTENT_CLIENT, type IContentClient } from '../../../../shared/application/ports/content-client.port.js';
import { ORGANIZATION_CLIENT, type IOrganizationClient } from '../../../../shared/application/ports/organization-client.port.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  AssignmentDomainValidationError,
  AssignmentApplicationError,
  ContentNotVisibleForAssigneeError,
  ContentServiceUnavailableError,
  InsufficientSchoolRoleError,
  InvalidContentRefError,
  OrganizationServiceUnavailableError,
} from '../errors/assignment-application.errors.js';
import { toAssignmentDto, type AssignmentDto } from '../dto/assignment.dto.js';
import { CreateAssignmentCommand } from './create-assignment.command.js';

@CommandHandler(CreateAssignmentCommand)
export class CreateAssignmentHandler
  implements ICommandHandler<CreateAssignmentCommand, Result<AssignmentDto, AssignmentApplicationError>>
{
  private readonly logger = new Logger(CreateAssignmentHandler.name);

  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(cmd: CreateAssignmentCommand): Promise<Result<AssignmentDto, AssignmentApplicationError>> {
    // 1. Validate content ref
    const refResult = ContentRef.create(cmd.contentType as any, cmd.contentId);
    if (refResult.isFail) {
      return Result.fail(new InvalidContentRefError(refResult.error.message));
    }
    const contentRef = refResult.value;

    // 2. Check content is visible to assignee
    const visibilityResult = await this.contentClient.checkVisibilityForUser(contentRef, cmd.assigneeId);
    if (visibilityResult.isFail) {
      return Result.fail(new ContentServiceUnavailableError(visibilityResult.error.message));
    }
    if (!visibilityResult.value.isVisible) {
      return Result.fail(new ContentNotVisibleForAssigneeError(visibilityResult.value.reason));
    }

    // 3. Verify assigner is teacher/admin in the school
    const assignerRoleResult = await this.orgClient.getMemberRole(cmd.schoolId, cmd.assignerId);
    if (assignerRoleResult.isFail) {
      return Result.fail(new OrganizationServiceUnavailableError(assignerRoleResult.error.message));
    }
    const assignerRole = assignerRoleResult.value;
    if (!assignerRole || !['OWNER', 'ADMIN', 'TEACHER'].includes(assignerRole)) {
      return Result.fail(new InsufficientSchoolRoleError('Assigner must be a teacher or admin in this school'));
    }

    // 4. Verify assignee is a student in the school
    const assigneeRoleResult = await this.orgClient.getMemberRole(cmd.schoolId, cmd.assigneeId);
    if (assigneeRoleResult.isFail) {
      return Result.fail(new OrganizationServiceUnavailableError(assigneeRoleResult.error.message));
    }
    const assigneeRole = assigneeRoleResult.value;
    if (!assigneeRole || assigneeRole !== 'STUDENT') {
      return Result.fail(new InsufficientSchoolRoleError('Assignee must be a student in this school'));
    }

    // 5. Create aggregate
    const assignmentResult = Assignment.create(
      { assignerId: cmd.assignerId, assigneeId: cmd.assigneeId, schoolId: cmd.schoolId, contentRef, dueAt: cmd.dueAt, notes: cmd.notes },
      this.clock,
    );
    if (assignmentResult.isFail) {
      return Result.fail(new AssignmentDomainValidationError(assignmentResult.error.message));
    }
    const assignment = assignmentResult.value;

    // 6. Persist
    await this.repo.save(assignment);
    this.logger.log(`Assignment created: ${assignment.id}`);

    // 7. Publish domain events
    for (const event of assignment.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    assignment.clearDomainEvents();

    return Result.ok(toAssignmentDto(assignment));
  }
}
