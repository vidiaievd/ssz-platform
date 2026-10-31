import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateAiPrecheckSettingsCommand } from './update-ai-precheck-settings.command.js';
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
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import {
  AI_PRACTICE_FEATURE_KEY,
  AiPrecheckSettings,
} from '../../../domain/value-objects/ai-precheck-settings.vo.js';
import {
  toAiPrecheckSettingsDto,
  type AiPrecheckSettingsDto,
} from '../../queries/get-ai-precheck-settings/get-ai-precheck-settings.handler.js';

/**
 * Sets whether the school's learners may have a model check their work before they hand it
 * in, and the school's limits on it (plan 84, step 4), on the owner's or an administrator's
 * word.
 *
 * Turning it on needs `ai.practice` on the plan, checked on every such save like the
 * assistant; turning it off, or changing the limits of a switched-off setting, never asks.
 * The monthly limit is not compared with the plan's here: the plan can change after the
 * save, so the engine takes the lower of the two at check time.
 */
@CommandHandler(UpdateAiPrecheckSettingsCommand)
export class UpdateAiPrecheckSettingsHandler implements ICommandHandler<UpdateAiPrecheckSettingsCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
    @Inject(WORKSPACE_ENTITLEMENTS_PORT) private readonly entitlements: IWorkspaceEntitlementsPort,
  ) {}

  async execute(command: UpdateAiPrecheckSettingsCommand): Promise<AiPrecheckSettingsDto> {
    const school = await this.schools.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const canSet = command.actorId === school.ownerId || school.getMemberRole(command.actorId) === MemberRole.ADMIN;
    if (!canSet) {
      throw new ForbiddenOperationException('Only owner or admin can set the AI check settings');
    }

    const settings = AiPrecheckSettings.create({
      enabled: command.enabled,
      perExerciseLimit: command.perExerciseLimit,
      perLearnerMonthlyCredits: command.perLearnerMonthlyCredits,
    });
    if (settings.enabled && !(await this.entitlements.isEnabled(school.id, AI_PRACTICE_FEATURE_KEY))) {
      throw new FeatureNotEntitledException(AI_PRACTICE_FEATURE_KEY);
    }

    await this.schools.saveAiPrecheckSettings(school.id, settings);
    return toAiPrecheckSettingsDto(settings);
  }
}
