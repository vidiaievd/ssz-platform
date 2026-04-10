import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteSchoolCommand } from './delete-school.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';

@CommandHandler(DeleteSchoolCommand)
export class DeleteSchoolHandler implements ICommandHandler<DeleteSchoolCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(command: DeleteSchoolCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    school.softDelete(command.actorId); // throws ForbiddenOperationException if not owner

    await this.schoolRepository.save(school);
  }
}
