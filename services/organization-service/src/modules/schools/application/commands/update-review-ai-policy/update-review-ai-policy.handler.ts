import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateReviewAiPolicyCommand } from './update-review-ai-policy.command.js';
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
  REVIEW_AI_POLICY_FEATURE_KEY,
  ReviewAiPolicy,
} from '../../../domain/value-objects/review-ai-policy.vo.js';
import {
  toReviewAiPolicyDto,
  type ReviewAiPolicyDto,
} from '../../queries/get-review-ai-policy/get-review-ai-policy.handler.js';

/**
 * Sets who answers the school's work first, on the owner's or an administrator's word —
 * the same people who set the response promise, for the same reason.
 *
 * A mode with a model needs `school.review_ai_policy` on the school's plan (plan 80, R7),
 * checked on every save of such a mode, not only on the switch to it: a school whose grant
 * ran out keeps its saved mode (exercise-engine stops applying it), but cannot write it
 * again. Going back to `teacher_only` is always allowed.
 */
@CommandHandler(UpdateReviewAiPolicyCommand)
export class UpdateReviewAiPolicyHandler implements ICommandHandler<UpdateReviewAiPolicyCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
    @Inject(WORKSPACE_ENTITLEMENTS_PORT) private readonly entitlements: IWorkspaceEntitlementsPort,
  ) {}

  async execute(command: UpdateReviewAiPolicyCommand): Promise<ReviewAiPolicyDto> {
    const school = await this.schools.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const canSet = command.actorId === school.ownerId || actorRole === MemberRole.ADMIN;
    if (!canSet) {
      throw new ForbiddenOperationException('Only owner or admin can set the review policy');
    }

    const policy = ReviewAiPolicy.create({
      mode: command.mode,
      autoAcceptAfterHours: command.autoAcceptAfterHours,
      samplePercent: command.samplePercent,
    });
    school.setReviewAiPolicy(policy);

    if (
      policy.usesAi &&
      !(await this.entitlements.isEnabled(school.id, REVIEW_AI_POLICY_FEATURE_KEY))
    ) {
      throw new FeatureNotEntitledException(REVIEW_AI_POLICY_FEATURE_KEY);
    }

    await this.schools.saveReviewAiPolicy(school.id, policy);
    return toReviewAiPolicyDto(policy);
  }
}
