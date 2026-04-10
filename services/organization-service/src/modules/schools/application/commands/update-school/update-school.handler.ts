import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateSchoolCommand } from './update-school.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';

@CommandHandler(UpdateSchoolCommand)
export class UpdateSchoolHandler implements ICommandHandler<UpdateSchoolCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(command: UpdateSchoolCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    // softDelete checks ownership internally via ForbiddenOperationException
    // update does not have authorization guard — owner/admin check done in controller
    school.update({
      name: command.name,
      description: command.description,
      avatarUrl: command.avatarUrl,
    });

    await this.schoolRepository.save(school);
  }
}
