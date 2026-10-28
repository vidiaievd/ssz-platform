import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateAssistantAccessCommand } from './update-assistant-access.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  WORKSPACE_ENTITLEMENTS_PORT,
  type IWorkspaceEntitlementsPort,
} from '../../../../../shared/application/ports/workspace-entitlements.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { FeatureNotEntitledException } from '../../../domain/exceptions/feature-not-entitled.exception.js';
import { InvalidAssistantAccessException } from '../../../domain/exceptions/invalid-assistant-access.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import {
  AssistantAccess,
  STUDENT_ASSIST_FEATURE_KEY,
} from '../../../domain/value-objects/assistant-access.vo.js';
import {
  toAssistantAccessDto,
  type AssistantAccessDto,
} from '../../queries/get-assistant-access/get-assistant-access.handler.js';

/**
 * Sets which students the school's assistant answers on the school's account (plan 83, Q6),
 * on the owner's or an administrator's word.
 *
 * Every id in both lists must still be the school's — a group of its own that is not
 * deleted, a student on its roster who is not archived — whatever the mode: a list kept for
 * later is still a list of this school's people. A mode that pays for anyone needs
 * `ai.student_assist` on the plan, checked on every such save like the review policy;
 * `off` is always allowed. A school whose grant runs out keeps its choice, and ai-service's
 * gate refuses the school as payer anyway.
 */
@CommandHandler(UpdateAssistantAccessCommand)
export class UpdateAssistantAccessHandler implements ICommandHandler<UpdateAssistantAccessCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
    @Inject(WORKSPACE_ENTITLEMENTS_PORT) private readonly entitlements: IWorkspaceEntitlementsPort,
  ) {}

  async execute(command: UpdateAssistantAccessCommand): Promise<AssistantAccessDto> {
    const school = await this.schools.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const canSet = command.actorId === school.ownerId || school.getMemberRole(command.actorId) === MemberRole.ADMIN;
    if (!canSet) {
      throw new ForbiddenOperationException('Only owner or admin can set the assistant settings');
    }

    const access = AssistantAccess.create({
      mode: command.mode,
      groupIds: command.groupIds,
      studentIds: command.studentIds,
    });
    const live = await this.schools.findAssistantSelectable(school.id, access.groupIds, access.studentIds);
    const strangers =
      access.groupIds.length - live.groupIds.length + (access.studentIds.length - live.studentIds.length);
    if (strangers > 0) {
      throw new InvalidAssistantAccessException(
        `${strangers} of the chosen groups and students are not this school's (deleted, archived or unknown)`,
      );
    }

    if (
      access.paysForAnyone &&
      !(await this.entitlements.isEnabled(school.id, STUDENT_ASSIST_FEATURE_KEY))
    ) {
      throw new FeatureNotEntitledException(STUDENT_ASSIST_FEATURE_KEY);
    }

    await this.schools.saveAssistantAccess(school.id, access);
    return toAssistantAccessDto(access);
  }
}
