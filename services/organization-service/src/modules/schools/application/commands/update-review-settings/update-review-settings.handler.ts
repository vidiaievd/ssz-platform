import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateReviewSettingsCommand } from './update-review-settings.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { ReviewSettings } from '../../../domain/value-objects/review-settings.vo.js';
import type { ReviewSettingsDto } from '../../queries/get-review-settings/get-review-settings.handler.js';

/**
 * Sets what the school promises, on the owner's or an administrator's word.
 *
 * A teacher cannot move it: the promise is what the school is held to in oversight, and
 * the people it is measured against are not the ones who get to set it.
 */
@CommandHandler(UpdateReviewSettingsCommand)
export class UpdateReviewSettingsHandler
  implements ICommandHandler<UpdateReviewSettingsCommand>
{
  constructor(@Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository) {}

  async execute(command: UpdateReviewSettingsCommand): Promise<ReviewSettingsDto> {
    const school = await this.schools.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const canSet = command.actorId === school.ownerId || actorRole === MemberRole.ADMIN;
    if (!canSet) {
      throw new ForbiddenOperationException(
        'Only owner or admin can set the review response time',
      );
    }

    const settings = ReviewSettings.create({
      respondWithinHours: command.respondWithinHours,
      escalateAfterHours: command.escalateAfterHours,
      escalateTo: command.escalateTo,
    });

    school.setReviewSettings(settings);
    await this.schools.saveReviewSettings(school.id, settings);

    return {
      respondWithinHours: settings.respondWithinHours,
      escalateAfterHours: settings.escalateAfterHours,
      escalateTo: settings.escalateTo,
    };
  }
}
