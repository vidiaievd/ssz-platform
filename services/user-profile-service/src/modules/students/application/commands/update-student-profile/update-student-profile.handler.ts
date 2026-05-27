import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { StudentProfileNotFoundException } from '../../../domain/exceptions/student-profile-not-found.exception.js';
import type { IStudentProfileRepository } from '../../../domain/repositories/student-profile.repository.interface.js';
import { STUDENT_PROFILE_REPOSITORY } from '../../../domain/repositories/student-profile.repository.interface.js';
import { UpdateStudentProfileCommand } from './update-student-profile.command.js';

@CommandHandler(UpdateStudentProfileCommand)
export class UpdateStudentProfileHandler implements ICommandHandler<UpdateStudentProfileCommand> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(STUDENT_PROFILE_REPOSITORY)
    private readonly studentProfileRepository: IStudentProfileRepository,
  ) {}

  async execute(command: UpdateStudentProfileCommand): Promise<void> {
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

    studentProfile.update(command.nativeLanguage);
    await this.studentProfileRepository.save(studentProfile);
  }
}
