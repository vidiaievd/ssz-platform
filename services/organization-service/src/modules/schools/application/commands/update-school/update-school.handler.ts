import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateSchoolCommand } from './update-school.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

@CommandHandler(UpdateSchoolCommand)
export class UpdateSchoolHandler implements ICommandHandler<UpdateSchoolCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(command: UpdateSchoolCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const canUpdate =
      command.actorId === school.ownerId || actorRole === MemberRole.ADMIN;

    if (!canUpdate) {
      throw new ForbiddenOperationException('Only owner or admin can update school settings');
    }

    school.update({
      name: command.name,
      description: command.description,
      avatarUrl: command.avatarUrl,
      requireTutorReviewForSelfPaced: command.requireTutorReviewForSelfPaced,
      defaultExplanationLanguage: command.defaultExplanationLanguage,
    });

    await this.schoolRepository.save(school);
  }
}
