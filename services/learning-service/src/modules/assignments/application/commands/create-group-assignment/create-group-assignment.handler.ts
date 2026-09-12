import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Assignment } from '../../../domain/entities/assignment.entity.js';
import { ContentRef } from '../../../../../shared/domain/value-objects/content-ref.js';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ASSIGNMENT_REPOSITORY,
  type IAssignmentRepository,
} from '../../../domain/repositories/assignment.repository.interface.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../../shared/application/ports/content-client.port.js';
import {
  ORGANIZATION_CLIENT,
  type IOrganizationClient,
} from '../../../../../shared/application/ports/organization-client.port.js';
import {
  LEARNING_EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../../shared/application/ports/clock.port.js';
import {
  AssignmentApplicationError,
  AssignmentDomainValidationError,
  ContentServiceUnavailableError,
  InvalidContentRefError,
  InsufficientSchoolRoleError,
  OrganizationServiceUnavailableError,
} from '../../errors/assignment-application.errors.js';
import { toAssignmentDto, type AssignmentDto } from '../../dto/assignment.dto.js';
import { CreateGroupAssignmentCommand } from './create-group-assignment.command.js';

export class GroupEmptyError extends AssignmentApplicationError {
  constructor(groupId: string) { super(`Group ${groupId} has no members`); }
}

export class GroupNotFoundError extends AssignmentApplicationError {
  constructor(groupId: string) { super(`Group ${groupId} not found`); }
}

@CommandHandler(CreateGroupAssignmentCommand)
export class CreateGroupAssignmentHandler
  implements ICommandHandler<CreateGroupAssignmentCommand, Result<AssignmentDto[], AssignmentApplicationError>>
{
  private readonly logger = new Logger(CreateGroupAssignmentHandler.name);

  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    cmd: CreateGroupAssignmentCommand,
  ): Promise<Result<AssignmentDto[], AssignmentApplicationError>> {
    // 1. Validate content ref
    const refResult = ContentRef.create(cmd.contentType as any, cmd.contentId);
    if (refResult.isFail) {
      return Result.fail(new InvalidContentRefError(refResult.error.message));
    }
    const contentRef = refResult.value;

    // 2. Verify assigner is teacher/admin in the school
    const assignerRoleResult = await this.orgClient.getMemberRole(cmd.schoolId, cmd.assignerId);
    if (assignerRoleResult.isFail) {
      return Result.fail(new OrganizationServiceUnavailableError(assignerRoleResult.error.message));
    }
    const assignerRole = assignerRoleResult.value;
    if (!assignerRole || !['OWNER', 'ADMIN', 'TEACHER'].includes(assignerRole)) {
      return Result.fail(new InsufficientSchoolRoleError('Assigner must be a teacher or admin in this school'));
    }

    // 3. Fetch group members from org service
    const membersResult = await this.orgClient.getGroupMemberIds(cmd.schoolId, cmd.groupId);
    if (membersResult.isFail) {
      const status = (membersResult.error as any).statusCode;
      if (status === 404) return Result.fail(new GroupNotFoundError(cmd.groupId));
      return Result.fail(new OrganizationServiceUnavailableError(membersResult.error.message));
    }
    const memberIds = membersResult.value;
    if (memberIds.length === 0) {
      return Result.fail(new GroupEmptyError(cmd.groupId));
    }

    // 4. Create one assignment per group member
    const created: AssignmentDto[] = [];

    for (const assigneeId of memberIds) {
      if (assigneeId === cmd.assignerId) continue;

      // Check content visibility per student. A refusal is a fact about that one learner
      // and skips them; a content service that could not answer is not, and used to be
      // folded into the same branch — so a broken upstream returned "201, nobody was
      // assigned anything" and the caller had no way to know the difference.
      const visibilityResult = await this.contentClient.checkVisibilityForUser(contentRef, assigneeId);
      if (visibilityResult.isFail) {
        return Result.fail(new ContentServiceUnavailableError(visibilityResult.error.message));
      }
      if (!visibilityResult.value.isVisible) {
        this.logger.warn(
          `Content not visible for student ${assigneeId} (${visibilityResult.value.reason ?? 'no reason given'}) — skipping`,
        );
        continue;
      }

      const assignmentResult = Assignment.create(
        {
          assignerId: cmd.assignerId,
          assigneeId,
          schoolId: cmd.schoolId,
          groupId: cmd.groupId,
          contentRef,
          dueAt: cmd.dueAt,
          notes: cmd.notes,
        },
        this.clock,
      );
      if (assignmentResult.isFail) {
        return Result.fail(new AssignmentDomainValidationError(assignmentResult.error.message));
      }

      const assignment = assignmentResult.value;
      await this.repo.save(assignment);

      for (const event of assignment.getDomainEvents()) {
        await this.publisher.publish(event.eventType, (event as any).payload);
      }
      assignment.clearDomainEvents();

      created.push(toAssignmentDto(assignment));
    }

    this.logger.log(`Group assignment created: ${created.length} assignments for group ${cmd.groupId}`);
    return Result.ok(created);
  }
}
