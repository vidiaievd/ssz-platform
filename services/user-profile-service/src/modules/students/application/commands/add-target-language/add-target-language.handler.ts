import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { StudentProfileNotFoundException } from '../../../domain/exceptions/student-profile-not-found.exception.js';
import type { IStudentProfileRepository } from '../../../domain/repositories/student-profile.repository.interface.js';
import { STUDENT_PROFILE_REPOSITORY } from '../../../domain/repositories/student-profile.repository.interface.js';
import { AddTargetLanguageCommand } from './add-target-language.command.js';

@CommandHandler(AddTargetLanguageCommand)
export class AddTargetLanguageHandler implements ICommandHandler<AddTargetLanguageCommand> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(STUDENT_PROFILE_REPOSITORY)
    private readonly studentProfileRepository: IStudentProfileRepository,
  ) {}

  async execute(command: AddTargetLanguageCommand): Promise<void> {
    const profile = await this.profileRepository.findByUserId(command.userId);
    if (!profile) {
      throw new ProfileNotFoundException(command.userId);
    }

    const studentProfile = await this.studentProfileRepository.findByProfileId(
      profile.id,
    );
    if (!studentProfile) {
      throw new StudentProfileNotFoundException(profile.id);
    }

    studentProfile.addTargetLanguage(command.languageCode);
    await this.studentProfileRepository.save(studentProfile);
  }
}
